"use server";

import { getSession } from "@quickengine/auth/server";
import {
	createFulfillment,
	deleteFulfillment,
	fulfillmentSettingsSchema,
	setFulfillmentStatus,
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
		settings: fulfillmentSettingsSchema.parse(module.settings),
	} as const;
}

export async function createFulfillmentAction(
	_previous: FulfillmentActionState,
	formData: FormData,
): Promise<FulfillmentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const invoiceId = String(formData.get("invoiceId") ?? "") || null;
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await createFulfillment(workspaceId, {
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
		});
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "INVOICE_NOT_PAID")
				return failure("Only paid invoices are ready for fulfillment.");
			if (error.message === "FULFILLMENT_SOURCE_EXISTS")
				return failure("That invoice already has a fulfillment record.");
			if (error.name === "ZodError")
				return failure("Check the fulfillment details.");
		}
		return failure("We couldn't create this fulfillment. Please try again.");
	}
	revalidatePath(`/${workspaceId}/fulfillment`);
	return { error: null, completionId: crypto.randomUUID() };
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
		await setFulfillmentStatus(
			workspaceId,
			id,
			target as "in_progress" | "fulfilled" | "failed" | "cancelled",
		);
	} catch {
		return failure(
			"This fulfillment can no longer make that lifecycle change.",
		);
	}
	revalidatePath(`/${workspaceId}/fulfillment`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function deleteFulfillmentAction(
	_previous: FulfillmentActionState,
	formData: FormData,
): Promise<FulfillmentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("fulfillmentId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	const deleted = await deleteFulfillment(workspaceId, id);
	if (!deleted)
		return failure("Only pending fulfillment records can be deleted.");
	revalidatePath(`/${workspaceId}/fulfillment`);
	return { error: null, completionId: crypto.randomUUID() };
}
