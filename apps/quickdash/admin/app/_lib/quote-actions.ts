"use server";

import { getSession } from "@quickengine/auth/server";
import {
	acceptQuoteEstimate,
	convertQuoteEstimateToInvoice,
	convertQuoteEstimateToOrder,
	createQuoteEstimate,
	declineQuoteEstimate,
	deleteDraftQuoteEstimate,
	expireQuoteEstimate,
	quotesEstimatesSettingsSchema,
	reviseQuoteEstimate,
	sendQuoteEstimate,
	updateDraftQuoteEstimate,
	voidQuoteEstimate,
} from "@quickengine/mod-quotes-estimates";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type QuoteActionState = {
	error: string | null;
	completionId: string | null;
};

const failure = (error: string): QuoteActionState => ({
	error,
	completionId: null,
});
const success = (): QuoteActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
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
	const module = access.modules.find((item) => item.id === "quotes-estimates");
	if (!module) {
		return {
			ok: false,
			error: "Quotes & Estimates is not enabled for this workspace.",
		} as const;
	}
	return {
		ok: true,
		settings: quotesEstimatesSettingsSchema.parse(module.settings),
	} as const;
}

function decimalToCents(value: FormDataEntryValue | null, label: string) {
	const text = String(value ?? "").trim();
	if (!/^\d+(\.\d{1,2})?$/.test(text)) {
		throw new Error(
			`${label} must be a non-negative amount with at most two decimals.`,
		);
	}
	const [whole, fraction = ""] = text.split(".");
	const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
	if (!Number.isSafeInteger(cents)) throw new Error(`${label} is too large.`);
	return cents;
}

const KINDS = ["quote", "estimate", "proposal"] as const;
type QuoteKind = (typeof KINDS)[number];
const asKind = (value: string): QuoteKind =>
	(KINDS as readonly string[]).includes(value) ? (value as QuoteKind) : "quote";

function prefixFor(
	settings: ReturnType<typeof quotesEstimatesSettingsSchema.parse>,
	kind: QuoteKind,
) {
	if (kind === "estimate") return settings.estimateNumberPrefix;
	if (kind === "proposal") return settings.proposalNumberPrefix;
	return settings.quoteNumberPrefix;
}

function readQuoteInput(formData: FormData) {
	const names = formData.getAll("lineName");
	const descriptions = formData.getAll("lineDescription");
	const quantities = formData.getAll("lineQuantity");
	const prices = formData.getAll("lineUnitPrice");
	if (
		names.length === 0 ||
		names.length !== descriptions.length ||
		names.length !== quantities.length ||
		names.length !== prices.length
	) {
		throw new Error("Add at least one complete line.");
	}
	const validUntil = String(formData.get("validUntil") ?? "").trim();
	return {
		clientId: String(formData.get("clientId") ?? ""),
		kind: asKind(String(formData.get("kind") ?? "quote")),
		title: String(formData.get("title") ?? "").trim(),
		currency: String(formData.get("currency") ?? "").trim(),
		validUntil: validUntil || null,
		taxCents: decimalToCents(formData.get("tax"), "Tax"),
		notes: String(formData.get("notes") ?? "").trim() || null,
		terms: String(formData.get("terms") ?? "").trim() || null,
		lines: names.map((name, index) => ({
			name: String(name),
			description: String(descriptions[index] ?? "").trim() || null,
			quantity: String(quantities[index] ?? ""),
			unitPriceCents: decimalToCents(prices[index] ?? null, "Unit price"),
		})),
	};
}

const friendlyFailure = (error: unknown) => {
	if (!(error instanceof Error)) return "We couldn't save this quote.";
	switch (error.message) {
		case "CLIENT_NOT_FOUND":
		case "CLIENT_WORKSPACE_MISMATCH":
			return "Choose a client from this workspace.";
		case "QUOTE_ESTIMATE_NOT_EDITABLE":
			return "Only draft quotes can be edited.";
		case "QUOTE_ESTIMATE_KIND_IMMUTABLE":
			return "A quote's type can't change after it's created.";
		case "QUOTE_ESTIMATE_ALREADY_EXPIRED":
		case "QUOTE_ESTIMATE_EXPIRED":
			return "This quote has passed its valid-until date.";
		case "QUOTE_ESTIMATE_NOT_EXPIRED":
			return "This quote hasn't reached its valid-until date yet.";
		case "QUOTE_ORDER_TAX_UNSUPPORTED":
			return "Orders can't carry tax yet — convert to an invoice instead.";
		case "INVOICING_MODULE_DISABLED":
			return "Enable Invoicing to convert this quote into an invoice.";
		case "ORDERS_MODULE_DISABLED":
			return "Enable Orders to convert this quote into an order.";
		case "QUOTE_ESTIMATE_CONCURRENT_UPDATE":
			return "Someone else just changed this quote. Refresh and try again.";
		default:
			break;
	}
	if (
		error.message.startsWith("QUOTE_ESTIMATE_NOT_") ||
		error.message === "QUOTE_ESTIMATE_ILLEGAL_TRANSITION"
	) {
		return "This quote can no longer make that change.";
	}
	if (error.name === "ZodError")
		return "Check the quote details and line items.";
	return error.message.startsWith("Tax ") ||
		error.message.startsWith("Unit price ") ||
		error.message.startsWith("Add at least")
		? error.message
		: "We couldn't save this quote. Please try again.";
};

export async function createQuoteAction(
	_previous: QuoteActionState,
	formData: FormData,
): Promise<QuoteActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = readQuoteInput(formData);
		await createQuoteEstimate(workspaceId, {
			...input,
			currency: input.currency || authorization.settings.defaultCurrency,
			numberPrefix: prefixFor(authorization.settings, input.kind),
		});
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/quotes-estimates`);
	return success();
}

export async function updateQuoteAction(
	_previous: QuoteActionState,
	formData: FormData,
): Promise<QuoteActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const quoteId = String(formData.get("quoteId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await updateDraftQuoteEstimate(
			workspaceId,
			quoteId,
			readQuoteInput(formData),
		);
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/quotes-estimates`);
	return success();
}

export async function acceptQuoteAction(
	_previous: QuoteActionState,
	formData: FormData,
): Promise<QuoteActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const quoteId = String(formData.get("quoteId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await acceptQuoteEstimate(workspaceId, quoteId, {
			acceptedByName: String(formData.get("acceptedByName") ?? "").trim(),
			acceptedByEmail:
				String(formData.get("acceptedByEmail") ?? "").trim() || null,
			note: String(formData.get("acceptanceNote") ?? "").trim() || null,
		});
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/quotes-estimates`);
	return success();
}

const TRANSITIONS = [
	"sent",
	"decline",
	"expire",
	"void",
	"revise",
	"delete",
	"convert-invoice",
	"convert-order",
] as const;
type QuoteTransition = (typeof TRANSITIONS)[number];

export async function changeQuoteStatusAction(
	_previous: QuoteActionState,
	formData: FormData,
): Promise<QuoteActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const quoteId = String(formData.get("quoteId") ?? "");
	const target = String(formData.get("target") ?? "") as QuoteTransition;
	if (!(TRANSITIONS as readonly string[]).includes(target)) {
		return failure("Invalid quote action.");
	}
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		switch (target) {
			case "sent":
				await sendQuoteEstimate(workspaceId, quoteId);
				break;
			case "decline":
				await declineQuoteEstimate(workspaceId, quoteId);
				break;
			case "expire":
				await expireQuoteEstimate(workspaceId, quoteId);
				break;
			case "void":
				await voidQuoteEstimate(workspaceId, quoteId);
				break;
			case "revise":
				await reviseQuoteEstimate(workspaceId, quoteId);
				break;
			case "delete": {
				const deleted = await deleteDraftQuoteEstimate(workspaceId, quoteId);
				if (!deleted) return failure("This quote no longer exists.");
				break;
			}
			case "convert-invoice":
				await convertQuoteEstimateToInvoice(workspaceId, quoteId);
				revalidatePath(`/${workspaceId}/invoicing`);
				break;
			case "convert-order":
				await convertQuoteEstimateToOrder(workspaceId, quoteId);
				revalidatePath(`/${workspaceId}/orders`);
				break;
		}
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/quotes-estimates`);
	return success();
}
