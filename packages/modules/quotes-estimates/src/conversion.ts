import {
	and,
	asc,
	db,
	eq,
	invoiceLineItems,
	invoices,
	orderLineItems,
	orders,
	quickengineWorkspaces,
	quoteEstimateLineItems,
	quoteEstimates,
	workspaceModules,
} from "@quickengine/db";
import {
	allocateInvoiceSequence,
	formatInvoiceNumber,
} from "@quickengine/mod-invoicing";
import {
	allocateOrderSequence,
	formatOrderNumber,
} from "@quickengine/mod-orders";
import {
	invoiceLineFromQuoteEstimateLine,
	orderLineFromQuoteEstimateLine,
} from "./conversion-lines";
import { quoteEstimateNumberPrefixSchema } from "./module";
import { canConvertQuoteEstimate } from "./status";

type QuoteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const QUOTES_ESTIMATES_SOURCE = "quotes-estimates";

async function lockQuoteForConversion(
	tx: QuoteTransaction,
	workspaceId: string,
	id: string,
) {
	const [workspace] = await tx
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1)
		.for("update");
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
	const [quote] = await tx
		.select()
		.from(quoteEstimates)
		.where(
			and(
				eq(quoteEstimates.workspaceId, workspaceId),
				eq(quoteEstimates.id, id),
			),
		)
		.limit(1)
		.for("update");
	if (!quote) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
	const lines = await tx
		.select()
		.from(quoteEstimateLineItems)
		.where(eq(quoteEstimateLineItems.quoteEstimateId, id))
		.orderBy(asc(quoteEstimateLineItems.position));
	if (lines.length === 0) throw new Error("QUOTE_ESTIMATE_LINES_MISSING");
	return { quote, lines };
}

async function assertModuleEnabled(
	tx: QuoteTransaction,
	workspaceId: string,
	moduleId: "invoicing" | "orders",
) {
	const [module] = await tx
		.select({ enabled: workspaceModules.enabled })
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				eq(workspaceModules.moduleId, moduleId),
			),
		)
		.limit(1);
	if (!module?.enabled) {
		throw new Error(
			moduleId === "invoicing"
				? "INVOICING_MODULE_DISABLED"
				: "ORDERS_MODULE_DISABLED",
		);
	}
}

export async function convertQuoteEstimateToInvoice(
	workspaceId: string,
	id: string,
	options: { numberPrefix?: string; now?: Date } = {},
) {
	const numberPrefix = quoteEstimateNumberPrefixSchema.parse(
		options.numberPrefix ?? "INV",
	);
	const now = options.now ?? new Date();
	return db.transaction(async (tx) => {
		const { quote, lines } = await lockQuoteForConversion(tx, workspaceId, id);
		if (quote.status === "converted") {
			if (!quote.convertedInvoiceId) {
				throw new Error("QUOTE_ESTIMATE_ALREADY_CONVERTED_TO_ORDER");
			}
			const [existing] = await tx
				.select()
				.from(invoices)
				.where(
					and(
						eq(invoices.workspaceId, workspaceId),
						eq(invoices.id, quote.convertedInvoiceId),
					),
				)
				.limit(1);
			if (!existing) throw new Error("CONVERTED_INVOICE_NOT_FOUND");
			return existing;
		}
		if (!canConvertQuoteEstimate(quote.status)) {
			throw new Error("QUOTE_ESTIMATE_NOT_CONVERTIBLE");
		}
		await assertModuleEnabled(tx, workspaceId, "invoicing");
		const sequence = await allocateInvoiceSequence(tx, workspaceId, now);
		const number = formatInvoiceNumber(numberPrefix, sequence);
		const invoiceLines = lines.map(invoiceLineFromQuoteEstimateLine);
		const invoiceSubtotal = invoiceLines.reduce(
			(total, line) => total + line.quantity * line.unitPriceCents,
			0,
		);
		if (invoiceSubtotal !== quote.subtotalCents) {
			throw new Error("QUOTE_INVOICE_TOTAL_MISMATCH");
		}
		const [invoice] = await tx
			.insert(invoices)
			.values({
				workspaceId,
				clientId: quote.clientId,
				number,
				status: "draft",
				currency: quote.currency,
				subtotalCents: quote.subtotalCents,
				taxCents: quote.taxCents,
				totalCents: quote.totalCents,
				notes: quote.notes,
			})
			.returning();
		await tx.insert(invoiceLineItems).values(
			invoiceLines.map((line) => ({
				invoiceId: invoice.id,
				...line,
			})),
		);
		const [converted] = await tx
			.update(quoteEstimates)
			.set({
				status: "converted",
				convertedInvoiceId: invoice.id,
				convertedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
					eq(quoteEstimates.status, "accepted"),
				),
			)
			.returning({ id: quoteEstimates.id });
		if (!converted) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
		return invoice;
	});
}

export async function convertQuoteEstimateToOrder(
	workspaceId: string,
	id: string,
	options: { numberPrefix?: string; now?: Date } = {},
) {
	const numberPrefix = quoteEstimateNumberPrefixSchema.parse(
		options.numberPrefix ?? "ORD",
	);
	const now = options.now ?? new Date();
	return db.transaction(async (tx) => {
		const { quote, lines } = await lockQuoteForConversion(tx, workspaceId, id);
		if (quote.status === "converted") {
			if (!quote.convertedOrderId) {
				throw new Error("QUOTE_ESTIMATE_ALREADY_CONVERTED_TO_INVOICE");
			}
			const [existing] = await tx
				.select()
				.from(orders)
				.where(
					and(
						eq(orders.workspaceId, workspaceId),
						eq(orders.id, quote.convertedOrderId),
					),
				)
				.limit(1);
			if (!existing) throw new Error("CONVERTED_ORDER_NOT_FOUND");
			return existing;
		}
		if (!canConvertQuoteEstimate(quote.status)) {
			throw new Error("QUOTE_ESTIMATE_NOT_CONVERTIBLE");
		}
		if (quote.taxCents !== 0) throw new Error("QUOTE_ORDER_TAX_UNSUPPORTED");
		await assertModuleEnabled(tx, workspaceId, "orders");
		const orderLines = lines.map(orderLineFromQuoteEstimateLine);
		const orderSubtotal = orderLines.reduce(
			(total, line) => total + line.lineTotalCents,
			0,
		);
		if (orderSubtotal !== quote.subtotalCents) {
			throw new Error("QUOTE_ORDER_TOTAL_MISMATCH");
		}
		const sequence = await allocateOrderSequence(tx, workspaceId, now);
		const [order] = await tx
			.insert(orders)
			.values({
				workspaceId,
				clientId: quote.clientId,
				clientName: quote.clientName,
				clientEmail: quote.clientEmail,
				sequence,
				number: formatOrderNumber(numberPrefix, sequence),
				status: "draft",
				currency: quote.currency,
				subtotalCents: quote.subtotalCents,
				totalCents: quote.totalCents,
				notes: quote.notes,
				metadata: {
					...quote.metadata,
					sourceModule: QUOTES_ESTIMATES_SOURCE,
					sourceRecordId: quote.id,
					sourceNumber: quote.number,
				},
			})
			.returning();
		await tx
			.insert(orderLineItems)
			.values(orderLines.map((line) => ({ orderId: order.id, ...line })));
		const [converted] = await tx
			.update(quoteEstimates)
			.set({
				status: "converted",
				convertedOrderId: order.id,
				convertedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
					eq(quoteEstimates.status, "accepted"),
				),
			)
			.returning({ id: quoteEstimates.id });
		if (!converted) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
		return order;
	});
}
