import {
	and,
	asc,
	catalogItems,
	catalogItemVariants,
	clientRecords,
	db,
	desc,
	eq,
	inArray,
	quickengineWorkspaces,
	quoteEstimateLineItems,
	quoteEstimateSequences,
	quoteEstimates,
	sql,
} from "@quickengine/db";
import {
	quoteEstimateNumberPrefixSchema,
	quotesEstimatesSettingsSchema,
} from "./module";
import {
	type QuoteAcceptanceInput,
	type QuoteEstimateInput,
	quoteAcceptanceInputSchema,
	quoteCalendarDateSchema,
	quoteEstimateInputSchema,
} from "./quote";
import {
	canReviseQuoteEstimate,
	canTransitionQuoteEstimate,
	type QuoteEstimateStatus,
} from "./status";
import {
	computeQuoteTotals,
	formatQuoteNumber,
	quoteLineTotalCents,
} from "./totals";

type QuoteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryExecutor = Pick<typeof db, "select">;
type ParsedQuoteInput = ReturnType<typeof quoteEstimateInputSchema.parse>;

type ResolvedQuoteLine = ParsedQuoteInput["lines"][number] & {
	variantOptions: Array<{ name: string; value: string }>;
};

const DEFAULT_PREFIXES = {
	quote: quotesEstimatesSettingsSchema.parse({}).quoteNumberPrefix,
	estimate: quotesEstimatesSettingsSchema.parse({}).estimateNumberPrefix,
	proposal: quotesEstimatesSettingsSchema.parse({}).proposalNumberPrefix,
} as const;

async function resolveQuoteReferences(
	executor: QueryExecutor,
	workspaceId: string,
	input: ParsedQuoteInput,
) {
	const [client] = await executor
		.select({
			workspaceId: clientRecords.workspaceId,
			name: clientRecords.name,
			email: clientRecords.email,
			company: clientRecords.company,
		})
		.from(clientRecords)
		.where(eq(clientRecords.id, input.clientId))
		.limit(1);
	if (!client) throw new Error("CLIENT_NOT_FOUND");
	if (client.workspaceId !== workspaceId) {
		throw new Error("CLIENT_WORKSPACE_MISMATCH");
	}

	const itemIds = [
		...new Set(
			input.lines.flatMap((line) =>
				line.catalogItemId ? [line.catalogItemId] : [],
			),
		),
	];
	const variantIds = [
		...new Set(
			input.lines.flatMap((line) =>
				line.catalogItemVariantId ? [line.catalogItemVariantId] : [],
			),
		),
	];
	const items = itemIds.length
		? await executor
				.select({
					id: catalogItems.id,
					workspaceId: catalogItems.workspaceId,
					type: catalogItems.type,
					status: catalogItems.status,
					sku: catalogItems.sku,
					unitLabel: catalogItems.unitLabel,
				})
				.from(catalogItems)
				.where(inArray(catalogItems.id, itemIds))
		: [];
	const variants = variantIds.length
		? await executor
				.select({
					id: catalogItemVariants.id,
					workspaceId: catalogItemVariants.workspaceId,
					catalogItemId: catalogItemVariants.catalogItemId,
					status: catalogItemVariants.status,
					sku: catalogItemVariants.sku,
					options: catalogItemVariants.options,
				})
				.from(catalogItemVariants)
				.where(inArray(catalogItemVariants.id, variantIds))
		: [];
	const itemById = new Map(items.map((item) => [item.id, item]));
	const variantById = new Map(variants.map((variant) => [variant.id, variant]));

	const lines: ResolvedQuoteLine[] = input.lines.map((line) => {
		if (!line.catalogItemId) return { ...line, variantOptions: [] };
		const item = itemById.get(line.catalogItemId);
		if (!item) throw new Error("CATALOG_ITEM_NOT_FOUND");
		if (item.workspaceId !== workspaceId) {
			throw new Error("CATALOG_ITEM_WORKSPACE_MISMATCH");
		}
		if (item.status === "archived") throw new Error("CATALOG_ITEM_ARCHIVED");

		if (!line.catalogItemVariantId) {
			return {
				...line,
				itemType: item.type,
				sku: line.sku ?? item.sku,
				unitLabel: line.unitLabel ?? item.unitLabel,
				variantOptions: [],
			};
		}
		const variant = variantById.get(line.catalogItemVariantId);
		if (!variant) throw new Error("CATALOG_ITEM_VARIANT_NOT_FOUND");
		if (variant.workspaceId !== workspaceId) {
			throw new Error("CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH");
		}
		if (variant.catalogItemId !== line.catalogItemId) {
			throw new Error("CATALOG_ITEM_VARIANT_PARENT_MISMATCH");
		}
		if (variant.status === "archived") {
			throw new Error("CATALOG_ITEM_VARIANT_ARCHIVED");
		}
		return {
			...line,
			itemType: item.type,
			sku: line.sku ?? variant.sku ?? item.sku,
			unitLabel: line.unitLabel ?? item.unitLabel,
			variantOptions: variant.options,
		};
	});
	return { client, lines };
}

async function insertQuoteLines(
	tx: QuoteTransaction,
	quoteEstimateId: string,
	lines: ResolvedQuoteLine[],
) {
	await tx.insert(quoteEstimateLineItems).values(
		lines.map((line, position) => ({
			quoteEstimateId,
			catalogItemId: line.catalogItemId,
			catalogItemVariantId: line.catalogItemVariantId,
			variantOptions: line.variantOptions,
			name: line.name,
			description: line.description,
			itemType: line.itemType,
			sku: line.sku,
			quantity: line.quantity,
			unitLabel: line.unitLabel,
			unitPriceCents: line.unitPriceCents,
			lineTotalCents: quoteLineTotalCents(line),
			position,
			metadata: line.metadata,
		})),
	);
}

function lifecycleClock(options: { now?: Date; today?: string } = {}) {
	const now = options.now ?? new Date();
	const today = quoteCalendarDateSchema.parse(
		options.today ?? now.toISOString().slice(0, 10),
	);
	return { now, today };
}

export type CreateQuoteEstimateInput = QuoteEstimateInput & {
	numberPrefix?: string;
};

// Core create logic, transaction-scoped so both the standalone wrapper and the durable API
// command (which supplies the unit-of-work transaction) share one implementation.
export async function createQuoteEstimateInTx(
	tx: QuoteTransaction,
	workspaceId: string,
	input: CreateQuoteEstimateInput,
) {
	const parsed = quoteEstimateInputSchema.parse(input);
	const numberPrefix = quoteEstimateNumberPrefixSchema.parse(
		input.numberPrefix ?? DEFAULT_PREFIXES[parsed.kind],
	);
	const totals = computeQuoteTotals(parsed.lines, parsed.taxCents);
	const [workspace] = await tx
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
	const { client, lines } = await resolveQuoteReferences(
		tx,
		workspaceId,
		parsed,
	);
	const now = new Date();
	const [counter] = await tx
		.insert(quoteEstimateSequences)
		.values({ workspaceId, lastSequence: 1, updatedAt: now })
		.onConflictDoUpdate({
			target: quoteEstimateSequences.workspaceId,
			set: {
				lastSequence: sql`${quoteEstimateSequences.lastSequence} + 1`,
				updatedAt: now,
			},
		})
		.returning({ sequence: quoteEstimateSequences.lastSequence });
	const [created] = await tx
		.insert(quoteEstimates)
		.values({
			workspaceId,
			seriesId: crypto.randomUUID(),
			clientId: parsed.clientId,
			clientName: client.name,
			clientEmail: client.email,
			clientCompany: client.company,
			kind: parsed.kind,
			title: parsed.title,
			numberPrefix,
			sequence: counter.sequence,
			revision: 1,
			number: formatQuoteNumber(numberPrefix, counter.sequence),
			currency: parsed.currency,
			...totals,
			validUntil: parsed.validUntil,
			notes: parsed.notes,
			terms: parsed.terms,
			metadata: parsed.metadata,
		})
		.returning();
	await insertQuoteLines(tx, created.id, lines);
	return created;
}

export async function createQuoteEstimate(
	workspaceId: string,
	input: CreateQuoteEstimateInput,
) {
	return db.transaction((tx) =>
		createQuoteEstimateInTx(tx, workspaceId, input),
	);
}

export async function listQuoteEstimates(
	workspaceId: string,
	status?: QuoteEstimateStatus,
) {
	return db
		.select()
		.from(quoteEstimates)
		.where(
			status
				? and(
						eq(quoteEstimates.workspaceId, workspaceId),
						eq(quoteEstimates.status, status),
					)
				: eq(quoteEstimates.workspaceId, workspaceId),
		)
		.orderBy(desc(quoteEstimates.createdAt));
}

export async function getQuoteEstimate(workspaceId: string, id: string) {
	const [quote] = await db
		.select()
		.from(quoteEstimates)
		.where(
			and(
				eq(quoteEstimates.workspaceId, workspaceId),
				eq(quoteEstimates.id, id),
			),
		)
		.limit(1);
	if (!quote) return undefined;
	const lines = await db
		.select()
		.from(quoteEstimateLineItems)
		.where(eq(quoteEstimateLineItems.quoteEstimateId, id))
		.orderBy(asc(quoteEstimateLineItems.position));
	return { ...quote, lines };
}

export async function updateDraftQuoteEstimateInTx(
	tx: QuoteTransaction,
	workspaceId: string,
	id: string,
	input: QuoteEstimateInput,
) {
	const parsed = quoteEstimateInputSchema.parse(input);
	const totals = computeQuoteTotals(parsed.lines, parsed.taxCents);
	const [current] = await tx
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
	if (!current) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
	if (current.status !== "draft")
		throw new Error("QUOTE_ESTIMATE_NOT_EDITABLE");
	if (parsed.kind !== current.kind) {
		throw new Error("QUOTE_ESTIMATE_KIND_IMMUTABLE");
	}
	const { client, lines } = await resolveQuoteReferences(
		tx,
		workspaceId,
		parsed,
	);
	const [updated] = await tx
		.update(quoteEstimates)
		.set({
			clientId: parsed.clientId,
			clientName: client.name,
			clientEmail: client.email,
			clientCompany: client.company,
			title: parsed.title,
			currency: parsed.currency,
			...totals,
			validUntil: parsed.validUntil,
			notes: parsed.notes,
			terms: parsed.terms,
			metadata: parsed.metadata,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(quoteEstimates.workspaceId, workspaceId),
				eq(quoteEstimates.id, id),
				eq(quoteEstimates.status, "draft"),
			),
		)
		.returning();
	if (!updated) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
	await tx
		.delete(quoteEstimateLineItems)
		.where(eq(quoteEstimateLineItems.quoteEstimateId, id));
	await insertQuoteLines(tx, id, lines);
	return updated;
}

export async function updateDraftQuoteEstimate(
	workspaceId: string,
	id: string,
	input: QuoteEstimateInput,
) {
	return db.transaction((tx) =>
		updateDraftQuoteEstimateInTx(tx, workspaceId, id, input),
	);
}

export async function sendQuoteEstimateInTx(
	tx: QuoteTransaction,
	workspaceId: string,
	id: string,
	options: { now?: Date; today?: string } = {},
) {
	const { now, today } = lifecycleClock(options);
	{
		const [current] = await tx
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
		if (!current) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
		if (current.status === "sent") return current;
		if (!canTransitionQuoteEstimate(current.status, "sent")) {
			throw new Error("QUOTE_ESTIMATE_NOT_SENDABLE");
		}
		if (current.validUntil && current.validUntil < today) {
			throw new Error("QUOTE_ESTIMATE_ALREADY_EXPIRED");
		}

		if (current.supersedesId) {
			const [previous] = await tx
				.select()
				.from(quoteEstimates)
				.where(
					and(
						eq(quoteEstimates.workspaceId, workspaceId),
						eq(quoteEstimates.id, current.supersedesId),
					),
				)
				.limit(1)
				.for("update");
			if (!previous || previous.seriesId !== current.seriesId) {
				throw new Error("QUOTE_ESTIMATE_REVISION_SOURCE_INVALID");
			}
			if (!canReviseQuoteEstimate(previous.status)) {
				throw new Error("QUOTE_ESTIMATE_REVISION_SOURCE_CHANGED");
			}
			await tx
				.update(quoteEstimates)
				.set({ status: "superseded", supersededAt: now, updatedAt: now })
				.where(
					and(
						eq(quoteEstimates.workspaceId, workspaceId),
						eq(quoteEstimates.id, previous.id),
						eq(quoteEstimates.status, previous.status),
					),
				);
		}

		const [sent] = await tx
			.update(quoteEstimates)
			.set({ status: "sent", sentAt: now, updatedAt: now })
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
					eq(quoteEstimates.status, "draft"),
				),
			)
			.returning();
		if (!sent) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
		return sent;
	}
}

export async function sendQuoteEstimate(
	workspaceId: string,
	id: string,
	options: { now?: Date; today?: string } = {},
) {
	return db.transaction((tx) =>
		sendQuoteEstimateInTx(tx, workspaceId, id, options),
	);
}

export async function acceptQuoteEstimateInTx(
	tx: QuoteTransaction,
	workspaceId: string,
	id: string,
	input: QuoteAcceptanceInput,
	options: { now?: Date; today?: string } = {},
) {
	const acceptance = quoteAcceptanceInputSchema.parse(input);
	const { now, today } = lifecycleClock(options);
	{
		const [current] = await tx
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
		if (!current) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
		if (current.status === "accepted") return current;
		if (!canTransitionQuoteEstimate(current.status, "accepted")) {
			throw new Error("QUOTE_ESTIMATE_NOT_ACCEPTABLE");
		}
		if (current.validUntil && current.validUntil < today) {
			throw new Error("QUOTE_ESTIMATE_EXPIRED");
		}
		const [accepted] = await tx
			.update(quoteEstimates)
			.set({
				status: "accepted",
				acceptedByName: acceptance.acceptedByName,
				acceptedByEmail: acceptance.acceptedByEmail,
				acceptanceNote: acceptance.note,
				acceptedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
					eq(quoteEstimates.status, "sent"),
				),
			)
			.returning();
		if (!accepted) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
		return accepted;
	}
}

export async function acceptQuoteEstimate(
	workspaceId: string,
	id: string,
	input: QuoteAcceptanceInput,
	options: { now?: Date; today?: string } = {},
) {
	return db.transaction((tx) =>
		acceptQuoteEstimateInTx(tx, workspaceId, id, input, options),
	);
}

export async function setSimpleQuoteStatusInTx(
	tx: QuoteTransaction,
	workspaceId: string,
	id: string,
	status: "declined" | "expired" | "voided",
	options: { now?: Date; today?: string } = {},
) {
	const { now, today } = lifecycleClock(options);
	{
		const [current] = await tx
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
		if (!current) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
		if (current.status === status) return current;
		if (!canTransitionQuoteEstimate(current.status, status)) {
			throw new Error("QUOTE_ESTIMATE_ILLEGAL_TRANSITION");
		}
		if (
			status === "expired" &&
			(!current.validUntil || current.validUntil >= today)
		) {
			throw new Error("QUOTE_ESTIMATE_NOT_EXPIRED");
		}
		const timestamp = {
			declined: { declinedAt: now },
			expired: { expiredAt: now },
			voided: { voidedAt: now },
		}[status];
		const [updated] = await tx
			.update(quoteEstimates)
			.set({ status, ...timestamp, updatedAt: now })
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
					eq(quoteEstimates.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
		return updated;
	}
}

function setSimpleQuoteStatus(
	workspaceId: string,
	id: string,
	status: "declined" | "expired" | "voided",
	options: { now?: Date; today?: string } = {},
) {
	return db.transaction((tx) =>
		setSimpleQuoteStatusInTx(tx, workspaceId, id, status, options),
	);
}

export function declineQuoteEstimate(workspaceId: string, id: string) {
	return setSimpleQuoteStatus(workspaceId, id, "declined");
}

export function expireQuoteEstimate(
	workspaceId: string,
	id: string,
	options: { now?: Date; today?: string } = {},
) {
	return setSimpleQuoteStatus(workspaceId, id, "expired", options);
}

export function voidQuoteEstimate(workspaceId: string, id: string) {
	return setSimpleQuoteStatus(workspaceId, id, "voided");
}

export async function reviseQuoteEstimate(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
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
		if (!current) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
		if (!canReviseQuoteEstimate(current.status)) {
			throw new Error("QUOTE_ESTIMATE_NOT_REVISABLE");
		}
		const [existing] = await tx
			.select()
			.from(quoteEstimates)
			.where(eq(quoteEstimates.supersedesId, current.id))
			.limit(1);
		if (existing) return existing;
		const lines = await tx
			.select()
			.from(quoteEstimateLineItems)
			.where(eq(quoteEstimateLineItems.quoteEstimateId, current.id))
			.orderBy(asc(quoteEstimateLineItems.position));
		const revision = current.revision + 1;
		const [created] = await tx
			.insert(quoteEstimates)
			.values({
				workspaceId,
				seriesId: current.seriesId,
				supersedesId: current.id,
				clientId: current.clientId,
				clientName: current.clientName,
				clientEmail: current.clientEmail,
				clientCompany: current.clientCompany,
				kind: current.kind,
				title: current.title,
				numberPrefix: current.numberPrefix,
				sequence: current.sequence,
				revision,
				number: formatQuoteNumber(
					current.numberPrefix,
					current.sequence,
					revision,
				),
				status: "draft",
				currency: current.currency,
				subtotalCents: current.subtotalCents,
				taxCents: current.taxCents,
				totalCents: current.totalCents,
				validUntil: current.validUntil,
				notes: current.notes,
				terms: current.terms,
				metadata: current.metadata,
			})
			.returning();
		await tx.insert(quoteEstimateLineItems).values(
			lines.map((line) => ({
				quoteEstimateId: created.id,
				catalogItemId: line.catalogItemId,
				catalogItemVariantId: line.catalogItemVariantId,
				variantOptions: line.variantOptions,
				name: line.name,
				description: line.description,
				itemType: line.itemType,
				sku: line.sku,
				quantity: line.quantity,
				unitLabel: line.unitLabel,
				unitPriceCents: line.unitPriceCents,
				lineTotalCents: line.lineTotalCents,
				position: line.position,
				metadata: line.metadata,
			})),
		);
		return created;
	});
}

export async function deleteDraftQuoteEstimateInTx(
	tx: QuoteTransaction,
	workspaceId: string,
	id: string,
) {
	{
		const [current] = await tx
			.select({ status: quoteEstimates.status })
			.from(quoteEstimates)
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("QUOTE_ESTIMATE_NOT_FOUND");
		if (current.status !== "draft")
			throw new Error("QUOTE_ESTIMATE_NOT_DELETABLE");
		const [deleted] = await tx
			.delete(quoteEstimates)
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.id, id),
					eq(quoteEstimates.status, "draft"),
				),
			)
			.returning();
		if (!deleted) throw new Error("QUOTE_ESTIMATE_CONCURRENT_UPDATE");
		return deleted;
	}
}

export async function deleteDraftQuoteEstimate(
	workspaceId: string,
	id: string,
) {
	return db.transaction((tx) =>
		deleteDraftQuoteEstimateInTx(tx, workspaceId, id),
	);
}
