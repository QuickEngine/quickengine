"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	acceptQuoteEstimateCommand,
	convertQuoteEstimateToInvoiceCommand,
	convertQuoteEstimateToOrderCommand,
	createQuoteEstimateCommand,
	declineQuoteEstimateCommand,
	deleteQuoteEstimateCommand,
	expireQuoteEstimate,
	quotesEstimatesSettingsSchema,
	reviseQuoteEstimate,
	sendQuoteEstimateCommand,
	updateDraftQuoteEstimateCommand,
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
		access,
		actorId: session.user.id,
		settings: quotesEstimatesSettingsSchema.parse(module.settings),
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
			: "This quote change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

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
	if (error instanceof Error && error.name === "DomainError")
		return error.message;
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
		const parsed = readQuoteInput(formData);
		const input = {
			...parsed,
			currency: parsed.currency || authorization.settings.defaultCurrency,
			numberPrefix: prefixFor(authorization.settings, parsed.kind),
		};
		const context = await mutationContext(
			authorization,
			"quotes.create",
			key(formData),
			input,
		);
		const outcome = await createQuoteEstimateCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
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
		const input = readQuoteInput(formData);
		const context = await mutationContext(
			authorization,
			"quotes.update",
			key(formData),
			{ id: quoteId, input },
		);
		const outcome = await updateDraftQuoteEstimateCommand(
			context,
			quoteId,
			input,
		);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
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
		const acceptance = {
			acceptedByName: String(formData.get("acceptedByName") ?? "").trim(),
			acceptedByEmail:
				String(formData.get("acceptedByEmail") ?? "").trim() || null,
			note: String(formData.get("acceptanceNote") ?? "").trim() || null,
		};
		const context = await mutationContext(
			authorization,
			"quotes.accept",
			key(formData),
			{ acceptance, id: quoteId },
		);
		const outcome = await acceptQuoteEstimateCommand(
			context,
			quoteId,
			acceptance,
		);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
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
			case "sent": {
				const context = await mutationContext(
					authorization,
					"quotes.send",
					key(formData),
					{ id: quoteId },
				);
				const outcome = await sendQuoteEstimateCommand(context, quoteId);
				if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
				break;
			}
			case "decline": {
				const context = await mutationContext(
					authorization,
					"quotes.decline",
					key(formData),
					{ id: quoteId },
				);
				const outcome = await declineQuoteEstimateCommand(context, quoteId);
				if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
				break;
			}
			case "delete": {
				const context = await mutationContext(
					authorization,
					"quotes.delete",
					key(formData),
					{ id: quoteId },
				);
				const outcome = await deleteQuoteEstimateCommand(context, quoteId);
				if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
				break;
			}
			case "convert-invoice": {
				const context = await mutationContext(
					authorization,
					"quotes.convert.invoice",
					key(formData),
					{ id: quoteId, target },
				);
				const outcome = await convertQuoteEstimateToInvoiceCommand(
					context,
					quoteId,
				);
				if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
				revalidatePath(`/${workspaceId}/invoicing`);
				break;
			}
			case "convert-order": {
				const context = await mutationContext(
					authorization,
					"quotes.convert.order",
					key(formData),
					{ id: quoteId, target },
				);
				const outcome = await convertQuoteEstimateToOrderCommand(
					context,
					quoteId,
				);
				if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
				revalidatePath(`/${workspaceId}/orders`);
				break;
			}
			// expire/void/revise are UI-only lifecycle operations, not part of the public API
			// surface, so they keep the existing module functions rather than a durable command.
			case "expire":
				await expireQuoteEstimate(workspaceId, quoteId);
				break;
			case "void":
				await voidQuoteEstimate(workspaceId, quoteId);
				break;
			case "revise":
				await reviseQuoteEstimate(workspaceId, quoteId);
				break;
		}
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/quotes-estimates`);
	return success();
}
