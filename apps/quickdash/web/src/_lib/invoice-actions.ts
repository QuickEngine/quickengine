import { workspaceApi } from "../lib/api";
import type { QuickDashContext } from "../lib/quickdash-api";
import {
	type ActionState,
	actionResult,
	cents,
	idempotencyKey,
} from "./action-result";

export type InvoiceActionState = ActionState;

const invoiceInput = (form: FormData) => {
	const descriptions = form.getAll("lineDescription");
	const quantities = form.getAll("lineQuantity");
	const prices = form.getAll("lineUnitPrice");
	const dueDate = String(form.get("dueDate") ?? "");
	return {
		clientId: String(form.get("clientId") ?? "") || null,
		currency: String(form.get("currency") ?? "USD"),
		taxCents: cents(form.get("tax")) ?? 0,
		notes: String(form.get("notes") ?? "") || null,
		dueAt: dueDate ? new Date(`${dueDate}T23:59:59.999Z`).toISOString() : null,
		lineItems: descriptions.map((description, index) => ({
			description: String(description),
			quantity: Number(quantities[index]),
			unitPriceCents: cents(prices[index] ?? null) ?? 0,
			position: index,
		})),
	};
};

async function save(form: FormData) {
	const workspaceId = String(form.get("workspaceId") ?? "");
	const api = workspaceApi(workspaceId);
	const id = String(form.get("invoiceId") ?? "");
	const body = invoiceInput(form);
	if (!id) {
		const context = (await api.request<QuickDashContext>("/quickdash/context"))
			.data;
		const settings = context.modules.find((module) => module.id === "invoicing")
			?.settings as { numberPrefix?: string } | undefined;
		Object.assign(body, { numberPrefix: settings?.numberPrefix ?? "INV" });
	}
	return api.request(id ? `/invoices/${id}` : "/invoices", {
		method: id ? "PATCH" : "POST",
		body,
		idempotencyKey: idempotencyKey(form),
	});
}

export function createInvoiceAction(
	_previous: InvoiceActionState,
	form: FormData,
) {
	return actionResult(() => save(form), "We couldn't save this invoice.");
}

export function updateInvoiceAction(
	_previous: InvoiceActionState,
	form: FormData,
) {
	return actionResult(() => save(form), "We couldn't save this invoice.");
}

export function changeInvoiceStatusAction(
	_previous: InvoiceActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.invoices.setStatus(
				String(form.get("invoiceId") ?? ""),
				String(form.get("target")) as "sent" | "void",
				idempotencyKey(form),
			),
		"This invoice can no longer make that change.",
	);
}

export function deleteInvoiceAction(
	_previous: InvoiceActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.invoices.delete(
				String(form.get("invoiceId") ?? ""),
				idempotencyKey(form),
			),
		"Only draft invoices can be deleted.",
	);
}
