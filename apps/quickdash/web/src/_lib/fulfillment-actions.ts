import type { QuickFulfillmentStatus } from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type FulfillmentActionState = ActionState;

export function createFulfillmentAction(
	_previous: FulfillmentActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const invoiceId = String(form.get("invoiceId") ?? "") || null;
	const dueDate = String(form.get("dueDate") ?? "");
	return actionResult(
		() =>
			api.fulfillments.create(
				{
					title: String(form.get("title") ?? ""),
					kind: String(form.get("kind") ?? "physical") as
						| "physical"
						| "digital"
						| "service"
						| "pickup"
						| "other",
					clientId: String(form.get("clientId") ?? "") || null,
					invoiceId,
					sourceModule: invoiceId ? "invoicing" : null,
					sourceRecordId: invoiceId,
					instructions: String(form.get("instructions") ?? "") || null,
					dueAt: dueDate
						? new Date(`${dueDate}T23:59:59.999Z`).toISOString()
						: null,
				},
				idempotencyKey(form),
			),
		"We couldn't create this fulfillment. Please try again.",
	);
}

export function changeFulfillmentStatusAction(
	_previous: FulfillmentActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.fulfillments.setStatus(
				String(form.get("fulfillmentId") ?? ""),
				String(form.get("target")) as QuickFulfillmentStatus,
				idempotencyKey(form),
			),
		"This fulfillment can no longer make that lifecycle change.",
	);
}

export function deleteFulfillmentAction(
	_previous: FulfillmentActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.fulfillments.delete(
				String(form.get("fulfillmentId") ?? ""),
				idempotencyKey(form),
			),
		"Only pending fulfillment records can be deleted.",
	);
}
