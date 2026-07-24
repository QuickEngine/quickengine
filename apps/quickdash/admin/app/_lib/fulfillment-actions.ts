"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	createFulfillmentCommand,
	deleteFulfillmentCommand,
	fulfillmentSettingsSchema,
	setFulfillmentStatusCommand,
} from "@quickengine/mod-fulfillment";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type FulfillmentActionState = {
	error: string | null;
	completionId: string | null;
};
const failure = (error: string): FulfillmentActionState => ({
	error,
	completionId: null,
});
const success = (): FulfillmentActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session)
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access)
		return { ok: false, error: "Workspace access was not found." } as const;
	const module = access.modules.find((item) => item.id === "fulfillment");
	if (!module)
		return {
			ok: false,
			error: "Fulfillment is not enabled for this workspace.",
		} as const;
	return {
		ok: true,
		access,
		actorId: session.user.id,
		settings: fulfillmentSettingsSchema.parse(module.settings),
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
			: "This delivery change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

// Durable commands raise DomainError with copy already written for a person.
const message = (error: unknown, fallback: string) =>
	error instanceof Error && error.name === "DomainError"
		? error.message
		: error instanceof Error && error.name === "ZodError"
			? "Check the fulfillment details."
			: fallback;

export async function createFulfillmentAction(
	_previous: FulfillmentActionState,
	formData: FormData,
): Promise<FulfillmentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const invoiceId = String(formData.get("invoiceId") ?? "") || null;
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);

	try {
		const input = {
			title: String(formData.get("title") ?? ""),
			kind: (String(formData.get("kind") ?? "") ||
				authorization.settings.defaultKind) as
				| "physical"
				| "digital"
				| "service"
				| "pickup"
				| "other",
			clientId: String(formData.get("clientId") ?? "") || null,
			invoiceId,
			sourceModule: invoiceId ? "invoicing" : null,
			sourceRecordId: invoiceId,
			instructions: String(formData.get("instructions") ?? "") || null,
			dueAt: formData.get("dueDate")
				? new Date(`${String(formData.get("dueDate"))}T23:59:59.999Z`)
				: null,
		};
		const context = await mutationContext(
			authorization,
			"fulfillments.create",
			key(formData),
			input,
		);
		const outcome = await createFulfillmentCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "We couldn't create this fulfillment. Please try again."),
		);
	}
	revalidatePath(`/${workspaceId}/fulfillment`);
	return success();
}

export async function changeFulfillmentStatusAction(
	_previous: FulfillmentActionState,
	formData: FormData,
): Promise<FulfillmentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("fulfillmentId") ?? "");
	const target = String(formData.get("target") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	if (!["in_progress", "fulfilled", "failed", "cancelled"].includes(target))
		return failure("Invalid fulfillment action.");
	try {
		const status = target as
			| "in_progress"
			| "fulfilled"
			| "failed"
			| "cancelled";
		const context = await mutationContext(
			authorization,
			"fulfillments.set-status",
			key(formData),
			{ id, status },
		);
		const outcome = await setFulfillmentStatusCommand(context, id, status);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(
				error,
				"This fulfillment can no longer make that lifecycle change.",
			),
		);
	}
	revalidatePath(`/${workspaceId}/fulfillment`);
	return success();
}

export async function deleteFulfillmentAction(
	_previous: FulfillmentActionState,
	formData: FormData,
): Promise<FulfillmentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("fulfillmentId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const context = await mutationContext(
			authorization,
			"fulfillments.delete",
			key(formData),
			{ id },
		);
		const outcome = await deleteFulfillmentCommand(context, id);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "Only pending fulfillment records can be deleted."),
		);
	}
	revalidatePath(`/${workspaceId}/fulfillment`);
	return success();
}
