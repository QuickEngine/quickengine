"use server";

import { getSession } from "@quickengine/auth/server";
import {
	createFileDocument,
	createFileDownloadAccess,
	createFileFolder,
	setFileDocumentStatus,
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
	return { ok: true } as const;
}
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
		await createFileFolder(workspaceId, {
			name: String(formData.get("name") ?? ""),
			parentId: String(formData.get("parentId") ?? "") || null,
		});
	} catch {
		return fail("Check the folder name and parent.");
	}
	revalidatePath(`/${workspaceId}/files`);
	return ok();
}
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
	try {
		await setFileDocumentStatus(
			workspaceId,
			String(formData.get("documentId")),
			String(formData.get("target")) as
				| "active"
				| "archived"
				| "trashed"
				| "deleting",
		);
	} catch {
		return fail("That file state transition is unavailable.");
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
