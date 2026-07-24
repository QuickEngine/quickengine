"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@quickengine/db";
import {
	// `createFileDocument` (not a command) is used on purpose — see uploadFileAction.
	createFileDocument,
	createFileDownloadAccess,
	createFileFolderCommand,
	setFileDocumentStatusCommand,
} from "@quickengine/mod-files";
import {
	createLocalStorageProvider,
	createVercelBlobStorageProvider,
} from "@quickengine/storage";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "./workspace-access";

export type FileActionState = {
	error: string | null;
	completionId: string | null;
};
const fail = (error: string): FileActionState => ({
	error,
	completionId: null,
});
const ok = (): FileActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});
async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) return { ok: false, error: "Your session expired." } as const;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access?.modules.some((module) => module.id === "files"))
		return {
			ok: false,
			error: "Files is not enabled for this workspace.",
		} as const;
	return { ok: true, access, actorId: session.user.id } as const;
}

async function mutationContext(
	authorization: Extract<Awaited<ReturnType<typeof authorize>>, { ok: true }>,
	operation: string,
	idempotencyKey: string,
	canonicalInput: unknown,
) {
	return {
		abortSignal: new AbortController().signal,
		actor: { id: authorization.actorId, type: "user" as const },
		deadlineAtMs: Date.now() + 10_000,
		fingerprint: await fingerprintCanonicalInput(canonicalInput),
		idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
		operation,
		organizationId: authorization.access.organizationId,
		requestId: crypto.randomUUID(),
		source: "quickdash" as const,
		workspaceId: authorization.access.workspace.id,
	};
}

const outcomeFailure = (kind: "conflict" | "in_progress") =>
	fail(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

// Durable commands raise DomainError with copy already written for a person.
const message = (error: unknown, fallback: string) =>
	error instanceof Error && error.name === "DomainError"
		? error.message
		: fallback;
function provider() {
	const token = process.env.BLOB_READ_WRITE_TOKEN;
	return token
		? createVercelBlobStorageProvider({
				token,
				storeId: process.env.BLOB_STORE_ID,
			})
		: createLocalStorageProvider();
}
async function checksum(file: File) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		await file.arrayBuffer(),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
export async function createFolderAction(
	_previous: FileActionState,
	formData: FormData,
) {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return fail(authorization.error);

	try {
		const input = {
			name: String(formData.get("name") ?? ""),
			parentId: String(formData.get("parentId") ?? "") || null,
		};
		const context = await mutationContext(
			authorization,
			"files.folder.create",
			key(formData),
			input,
		);
		const outcome = await createFileFolderCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(message(error, "Check the folder name and parent."));
	}
	revalidatePath(`/${workspaceId}/files`);
	return ok();
}
/**
 * Upload does NOT go through a durable command, and on purpose.
 *
 * Storing a file is a saga, not a transaction: reserve a version row, put the bytes in storage,
 * then record the outcome. A unit of work would hold a Postgres transaction open across a network
 * upload, and a rollback would orphan bytes already written. `createFileDocument` already owns that
 * sequence, including its own compensation on write failure and checksum mismatch.
 *
 * The Redis claim below is therefore load-bearing rather than redundant: a duplicate upload stores
 * the bytes twice and meters the organization's storage allowance twice, so this guard prevents a
 * real cost, not just a duplicate row. It is released on failure so a corrected retry can actually
 * upload. When the API exposes signed direct-to-storage uploads, this collapses into a durable
 * reserve command plus a durable finalize command, and the byte transfer never touches this server.
 */
export async function uploadFileAction(
	_previous: FileActionState,
	formData: FormData,
) {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return fail(authorization.error);
	const file = formData.get("file");
	if (!(file instanceof File) || file.size === 0)
		return fail("Choose a nonempty file.");

	// Claimed after the file check so a missing file doesn't burn the key. A duplicate upload
	// is the one create that costs real infrastructure — it stores the bytes twice and meters
	// the org's storage allowance twice — so this guard is doing more than deduping a row.
	const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
	const idempotencyScope = `files.upload:${workspaceId}`;
	if (!(await claimIdempotencyKey(idempotencyKey, idempotencyScope))) {
		revalidatePath(`/${workspaceId}/files`);
		return ok();
	}

	try {
		await createFileDocument(
			workspaceId,
			{
				title: String(formData.get("title") ?? file.name),
				description: String(formData.get("description") ?? "") || null,
				folderId: String(formData.get("folderId") ?? "") || null,
				tags: String(formData.get("tags") ?? "")
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean),
			},
			{
				originalName: file.name,
				contentType: file.type || "application/octet-stream",
				sizeBytes: file.size,
				checksumSha256: await checksum(file),
			},
			file,
			provider(),
		);
	} catch {
		// Storage/verification failure is one of the likeliest failures in the app, and the
		// retry must actually upload — so the key goes back.
		await releaseIdempotencyKey(idempotencyKey, idempotencyScope);
		return fail(
			"The file could not be verified and stored. Check its size, type, and storage configuration.",
		);
	}
	revalidatePath(`/${workspaceId}/files`);
	return ok();
}
export async function fileStatusAction(
	_previous: FileActionState,
	formData: FormData,
) {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return fail(authorization.error);
	const documentId = String(formData.get("documentId"));
	try {
		const status = String(formData.get("target")) as
			| "active"
			| "archived"
			| "trashed"
			| "deleting";
		const context = await mutationContext(
			authorization,
			"files.document.status",
			key(formData),
			{ documentId, status },
		);
		const outcome = await setFileDocumentStatusCommand(
			context,
			documentId,
			status,
		);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(message(error, "That file state transition is unavailable."));
	}
	revalidatePath(`/${workspaceId}/files`);
	return ok();
}
export async function downloadFileAction(formData: FormData) {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return;
	const storage = provider();
	const access = await createFileDownloadAccess(
		workspaceId,
		String(formData.get("documentId")),
		null,
		(name) => (name === storage.name ? storage : undefined),
	);
	redirect(access.url);
}
