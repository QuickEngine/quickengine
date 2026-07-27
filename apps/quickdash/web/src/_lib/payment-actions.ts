import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	cents,
	idempotencyKey,
} from "./action-result";

export type PaymentActionState = ActionState;

export function recordOfflinePaymentAction(
	_previous: PaymentActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.payments.record(
				{
					invoiceId: String(form.get("invoiceId") ?? "") || null,
					clientId: String(form.get("clientId") ?? "") || null,
					amountCents: cents(form.get("amount")) ?? 0,
					currency: String(form.get("currency") ?? "USD"),
					provider: "manual",
					paymentMethod: String(form.get("paymentMethod") ?? "other"),
					reference: String(form.get("reference") ?? "") || null,
					notes: String(form.get("notes") ?? "") || null,
					status: "succeeded",
				},
				idempotencyKey(form),
			),
		"We couldn't record this payment. Please try again.",
	);
}

export function refundOfflinePaymentAction(
	_previous: PaymentActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.payments.refund(
				String(form.get("paymentId") ?? ""),
				{
					amountCents: cents(form.get("amount")) ?? 0,
					reason: String(form.get("reason") ?? "") || null,
				},
				idempotencyKey(form),
			),
		"We couldn't record this refund. Please try again.",
	);
}
