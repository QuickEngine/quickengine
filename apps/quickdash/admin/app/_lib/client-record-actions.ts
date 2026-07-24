"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	ClientRecordNotFoundError,
	clientRecordInputSchema,
	clientRecordsSettingsSchema,
	createClientCommand,
	deleteClientCommand,
	updateClientCommand,
} from "@quickengine/mod-client-records";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type ClientRecordActionState = {
	error: string | null;
	completionId: string | null;
};

const failure = (error: string): ClientRecordActionState => ({
	error,
	completionId: null,
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
	const module = access.modules.find(
		(module) => module.id === "client-records",
	);
	if (!module) {
		return {
			ok: false,
			error: "Client Records is not enabled for this workspace.",
		} as const;
	}
	return {
		ok: true,
		access,
		actorId: session.user.id,
		settings: clientRecordsSettingsSchema.parse(module.settings),
	} as const;
}

const inputFrom = (
	formData: FormData,
	fields: { phone: boolean; company: boolean; notes: boolean },
) => ({
	name: String(formData.get("name") ?? ""),
	email: String(formData.get("email") ?? ""),
	...(fields.phone ? { phone: String(formData.get("phone") ?? "") } : {}),
	...(fields.company ? { company: String(formData.get("company") ?? "") } : {}),
	...(fields.notes ? { notes: String(formData.get("notes") ?? "") } : {}),
});

const friendlyFailure = (error: unknown) => {
	if (error instanceof Error && error.name === "ZodError") {
		return "Check the client details and try again.";
	}
	return "We couldn't save this client. Please try again.";
};

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
			? "This request was already used with different client details. Try again."
			: "This client change is still being processed. Try again shortly.",
	);

export async function createClientRecordAction(
	_previous: ClientRecordActionState,
	formData: FormData,
): Promise<ClientRecordActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) {
		return failure(authorization.error);
	}

	try {
		const input = clientRecordInputSchema.parse(
			inputFrom(formData, authorization.settings.fields),
		);
		const context = await mutationContext(
			authorization,
			"clients.create",
			String(formData.get("idempotencyKey") ?? ""),
			input,
		);
		const outcome = await createClientCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(friendlyFailure(error));
	}

	revalidatePath(`/${workspaceId}/client-records`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function updateClientRecordAction(
	_previous: ClientRecordActionState,
	formData: FormData,
): Promise<ClientRecordActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const recordId = String(formData.get("recordId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) {
		return failure(authorization.error);
	}

	try {
		const input = clientRecordInputSchema.parse(
			inputFrom(formData, authorization.settings.fields),
		);
		const context = await mutationContext(
			authorization,
			"clients.update",
			String(formData.get("idempotencyKey") ?? ""),
			{ id: recordId, input },
		);
		const outcome = await updateClientCommand(context, recordId, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		if (error instanceof ClientRecordNotFoundError) {
			return failure("This client no longer exists in this workspace.");
		}
		return failure(friendlyFailure(error));
	}

	revalidatePath(`/${workspaceId}/client-records`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function deleteClientRecordAction(
	_previous: ClientRecordActionState,
	formData: FormData,
): Promise<ClientRecordActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const recordId = String(formData.get("recordId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) {
		return failure(authorization.error);
	}

	try {
		const context = await mutationContext(
			authorization,
			"clients.delete",
			String(formData.get("idempotencyKey") ?? ""),
			{ id: recordId },
		);
		const outcome = await deleteClientCommand(context, recordId);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		if (error instanceof ClientRecordNotFoundError) {
			return failure("This client no longer exists in this workspace.");
		}
		return failure(
			"This record is connected to other business records and cannot be deleted yet.",
		);
	}

	revalidatePath(`/${workspaceId}/client-records`);
	return { error: null, completionId: crypto.randomUUID() };
}
