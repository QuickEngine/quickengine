"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	contractsEsignSettingsSchema,
	createContractCommand,
	deleteDraftContractCommand,
	expireContractCommand,
	reviseContractCommand,
	// `sendContract` (not the command) is used on purpose — see sendContractAction.
	sendContract,
	updateDraftContractCommand,
	voidContractCommand,
} from "@quickengine/mod-contracts-esign";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type ContractSignerLink = { name: string; email: string; url: string };
export type ContractActionState = {
	error: string | null;
	completionId: string | null;
	// Populated only by "send": the one-time signing links to share manually
	// (no email delivery is built yet).
	invitations: ContractSignerLink[] | null;
};

const failure = (error: string): ContractActionState => ({
	error,
	completionId: null,
	invitations: null,
});
const success = (
	invitations: ContractSignerLink[] | null = null,
): ContractActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
	invitations,
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) {
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	}
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		return { ok: false, error: "Workspace access was not found." } as const;
	}
	const module = access.modules.find((item) => item.id === "contracts-esign");
	if (!module) {
		return {
			ok: false,
			error: "Contracts & E-sign is not enabled for this workspace.",
		} as const;
	}
	return {
		ok: true,
		access,
		actorId: session.user.id,
		settings: contractsEsignSettingsSchema.parse(module.settings),
	} as const;
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
	failure(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This agreement change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

function readContractInput(formData: FormData) {
	const names = formData.getAll("signerName");
	const emails = formData.getAll("signerEmail");
	const roles = formData.getAll("signerRole");
	if (
		names.length === 0 ||
		names.length !== emails.length ||
		names.length !== roles.length
	) {
		throw new Error("Add at least one complete signer.");
	}
	const effectiveOn = String(formData.get("effectiveOn") ?? "").trim();
	const endsOn = String(formData.get("endsOn") ?? "").trim();
	return {
		clientId: String(formData.get("clientId") ?? ""),
		fileVersionId: String(formData.get("fileVersionId") ?? ""),
		title: String(formData.get("title") ?? "").trim(),
		description: String(formData.get("description") ?? "").trim() || null,
		effectiveOn: effectiveOn || null,
		endsOn: endsOn || null,
		signers: names.map((name, index) => ({
			name: String(name),
			email: String(emails[index] ?? ""),
			role: String(roles[index] ?? "").trim() || null,
		})),
	};
}

const friendlyFailure = (error: unknown) => {
	// Durable commands raise DomainError with copy already written for a person.
	if (error instanceof Error && error.name === "DomainError")
		return error.message;
	if (!(error instanceof Error)) return "We couldn't save this agreement.";
	switch (error.message) {
		case "CLIENT_NOT_FOUND":
		case "CLIENT_WORKSPACE_MISMATCH":
			return "Choose a client from this workspace.";
		case "FILE_VERSION_NOT_FOUND":
		case "FILE_VERSION_WORKSPACE_MISMATCH":
			return "Choose a document version from this workspace.";
		case "FILE_VERSION_NOT_AVAILABLE":
		case "FILE_DOCUMENT_UNAVAILABLE":
			return "That document version isn't available to send.";
		case "CONTRACT_NOT_EDITABLE":
			return "Only draft agreements can be edited.";
		case "CONTRACT_NOT_SENDABLE":
			return "Only a draft with signers can be sent.";
		case "CONTRACT_REQUIRES_SIGNERS":
			return "Add at least one signer before sending.";
		case "CONTRACT_NOT_EXPIRABLE":
		case "CONTRACT_NOT_EXPIRED":
			return "This agreement can't be marked expired yet.";
		case "CONTRACT_NOT_VOIDABLE":
			return "This agreement can no longer be voided.";
		case "CONTRACT_NOT_REVISABLE":
			return "This agreement can't be revised.";
		case "CONTRACT_NOT_DELETABLE":
			return "Only draft agreements can be deleted.";
		case "CONTRACT_CONCURRENT_UPDATE":
			return "Someone else just changed this agreement. Refresh and retry.";
		default:
			break;
	}
	if (error.name === "ZodError")
		return "Check the agreement details, signer emails, and dates.";
	return error.message.startsWith("Add at least")
		? error.message
		: "We couldn't save this agreement. Please try again.";
};

export async function createContractAction(
	_previous: ContractActionState,
	formData: FormData,
): Promise<ContractActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = {
			...readContractInput(formData),
			numberPrefix: authorization.settings.contractNumberPrefix,
		};
		const context = await mutationContext(
			authorization,
			"contracts.create",
			key(formData),
			input,
		);
		const outcome = await createContractCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/contracts-esign`);
	return success();
}

export async function updateContractAction(
	_previous: ContractActionState,
	formData: FormData,
): Promise<ContractActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const contractId = String(formData.get("contractId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = readContractInput(formData);
		const context = await mutationContext(
			authorization,
			"contracts.update",
			key(formData),
			{ id: contractId, input },
		);
		const outcome = await updateDraftContractCommand(
			context,
			contractId,
			input,
		);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/contracts-esign`);
	return success();
}

/**
 * Send is the one contract operation that does NOT go through a durable command, and on purpose.
 *
 * Sending mints a one-time signing token per signer. The durable layer persists a command's result
 * in `api_mutations` for replay, so a token returned from a durable command would be written to the
 * database in plaintext and handed back on every replay — a signing credential leak. `sendCommand`
 * therefore drops the tokens, which is correct for the public API (links get emailed out of band).
 *
 * QuickDash has no email delivery yet, so it needs the raw tokens to show shareable links. It calls
 * the module's `sendContract` directly to keep the tokens ephemeral (return value only, never
 * persisted). Double-send is already prevented by the status machine: `sendContract` requires a
 * draft and updates `WHERE status = 'draft'`, so a second call throws `CONTRACT_NOT_SENDABLE`. The
 * durable idempotency key is therefore not needed here.
 */
export async function sendContractAction(
	_previous: ContractActionState,
	formData: FormData,
): Promise<ContractActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const contractId = String(formData.get("contractId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const { invitations } = await sendContract(workspaceId, contractId, {
			actorId: authorization.actorId,
		});
		const base = process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL ?? "";
		revalidatePath(`/${workspaceId}/contracts-esign`);
		return success(
			invitations.map((invitation) => ({
				name: invitation.name,
				email: invitation.email,
				url: `${base}/sign/${invitation.token}`,
			})),
		);
	} catch (error) {
		return failure(friendlyFailure(error));
	}
}

const TRANSITIONS = ["void", "expire", "revise", "delete"] as const;
type ContractTransition = (typeof TRANSITIONS)[number];

export async function changeContractStatusAction(
	_previous: ContractActionState,
	formData: FormData,
): Promise<ContractActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const contractId = String(formData.get("contractId") ?? "");
	const target = String(formData.get("target") ?? "") as ContractTransition;
	if (!(TRANSITIONS as readonly string[]).includes(target)) {
		return failure("Invalid agreement action.");
	}
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const context = await mutationContext(
			authorization,
			`contracts.${target}`,
			key(formData),
			{ id: contractId, target },
		);
		const outcome =
			target === "void"
				? await voidContractCommand(context, contractId)
				: target === "expire"
					? await expireContractCommand(context, contractId)
					: target === "revise"
						? await reviseContractCommand(context, contractId)
						: await deleteDraftContractCommand(context, contractId);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/contracts-esign`);
	return success();
}
