import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	cents,
	idempotencyKey,
} from "./action-result";

export type QuoteActionState = ActionState;

const quoteInput = (form: FormData) => {
	const names = form.getAll("lineName");
	const descriptions = form.getAll("lineDescription");
	const quantities = form.getAll("lineQuantity");
	const prices = form.getAll("lineUnitPrice");
	return {
		clientId: String(form.get("clientId") ?? ""),
		kind: String(form.get("kind") ?? "quote"),
		title: String(form.get("title") ?? ""),
		currency: String(form.get("currency") ?? "USD"),
		validUntil: String(form.get("validUntil") ?? "") || null,
		taxCents: cents(form.get("tax")) ?? 0,
		notes: String(form.get("notes") ?? "") || null,
		terms: String(form.get("terms") ?? "") || null,
		lines: names.map((name, index) => ({
			name: String(name),
			description: String(descriptions[index] ?? "") || null,
			quantity: String(quantities[index] ?? ""),
			unitPriceCents: cents(prices[index] ?? null) ?? 0,
		})),
	};
};

export function createQuoteAction(_previous: QuoteActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.request("/quotes", {
				method: "POST",
				body: quoteInput(form),
				idempotencyKey: idempotencyKey(form),
			}),
		"We couldn't save this quote.",
	);
}

export function updateQuoteAction(_previous: QuoteActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.request(`/quotes/${String(form.get("quoteId") ?? "")}`, {
				method: "PATCH",
				body: quoteInput(form),
				idempotencyKey: idempotencyKey(form),
			}),
		"We couldn't save this quote.",
	);
}

export function acceptQuoteAction(_previous: QuoteActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.quotes.accept(
				String(form.get("quoteId") ?? ""),
				{
					acceptedByName: String(form.get("acceptedByName") ?? ""),
					acceptedByEmail: String(form.get("acceptedByEmail") ?? ""),
					note: String(form.get("acceptanceNote") ?? "") || null,
				},
				idempotencyKey(form),
			),
		"This quote could not be accepted.",
	);
}

export function changeQuoteStatusAction(
	_previous: QuoteActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("quoteId") ?? "");
	const target = String(form.get("target") ?? "");
	const key = idempotencyKey(form);
	return actionResult(() => {
		switch (target) {
			case "sent":
				return api.quotes.send(id, key);
			case "decline":
				return api.quotes.decline(id, key);
			case "expire":
				return api.quotes.expire(id, key);
			case "void":
				return api.quotes.void(id, key);
			case "revise":
				return api.quotes.revise(id, key);
			case "delete":
				return api.quotes.delete(id, key);
			case "convert-invoice":
				return api.quotes.convert(id, "invoice", key);
			case "convert-order":
				return api.quotes.convert(id, "order", key);
			default:
				throw new Error("Invalid quote action.");
		}
	}, "This quote can no longer make that change.");
}
