import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems, catalogItemVariants } from "./catalog-items";
import { clientRecords } from "./client-records";
import { invoices } from "./invoices";
import { orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

// A durable counter prevents quote numbers from racing under concurrent creation
// or being reused after a draft is deleted.
export const quoteEstimateSequences = pgTable(
	"quote_estimate_sequences",
	{
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		lastSequence: integer("last_sequence").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			name: "quote_estimate_sequences_workspace_pk",
			columns: [table.workspaceId],
		}),
		check(
			"quote_estimate_sequences_positive_check",
			sql`${table.lastSequence} >= 0`,
		),
	],
);

export const quoteEstimates = pgTable(
	"quote_estimates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		seriesId: uuid("series_id").notNull(),
		supersedesId: uuid("supersedes_id").references(
			(): AnyPgColumn => quoteEstimates.id,
			{ onDelete: "restrict" },
		),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		clientName: text("client_name").notNull(),
		clientEmail: text("client_email"),
		clientCompany: text("client_company"),
		kind: text("kind", { enum: ["quote", "estimate", "proposal"] }).notNull(),
		title: text("title").notNull(),
		numberPrefix: text("number_prefix").notNull(),
		sequence: integer("sequence").notNull(),
		revision: integer("revision").notNull().default(1),
		number: text("number").notNull(),
		status: text("status", {
			enum: [
				"draft",
				"sent",
				"accepted",
				"declined",
				"expired",
				"superseded",
				"converted",
				"voided",
			],
		})
			.notNull()
			.default("draft"),
		currency: text("currency").notNull().default("USD"),
		subtotalCents: integer("subtotal_cents").notNull(),
		taxCents: integer("tax_cents").notNull().default(0),
		totalCents: integer("total_cents").notNull(),
		validUntil: date("valid_until", { mode: "string" }),
		notes: text("notes"),
		terms: text("terms"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		acceptedByName: text("accepted_by_name"),
		acceptedByEmail: text("accepted_by_email"),
		acceptanceNote: text("acceptance_note"),
		convertedInvoiceId: uuid("converted_invoice_id").references(
			() => invoices.id,
			{ onDelete: "restrict" },
		),
		convertedOrderId: uuid("converted_order_id").references(() => orders.id, {
			onDelete: "restrict",
		}),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		declinedAt: timestamp("declined_at", { withTimezone: true }),
		expiredAt: timestamp("expired_at", { withTimezone: true }),
		supersededAt: timestamp("superseded_at", { withTimezone: true }),
		convertedAt: timestamp("converted_at", { withTimezone: true }),
		voidedAt: timestamp("voided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("quote_estimates_workspace_idx").on(table.workspaceId),
		index("quote_estimates_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
		index("quote_estimates_client_idx").on(table.clientId),
		index("quote_estimates_series_idx").on(table.workspaceId, table.seriesId),
		uniqueIndex("quote_estimates_workspace_number_idx").on(
			table.workspaceId,
			table.number,
		),
		uniqueIndex("quote_estimates_series_revision_idx").on(
			table.workspaceId,
			table.seriesId,
			table.revision,
		),
		uniqueIndex("quote_estimates_supersedes_idx")
			.on(table.supersedesId)
			.where(sql`${table.supersedesId} is not null`),
		uniqueIndex("quote_estimates_converted_invoice_idx")
			.on(table.convertedInvoiceId)
			.where(sql`${table.convertedInvoiceId} is not null`),
		uniqueIndex("quote_estimates_converted_order_idx")
			.on(table.convertedOrderId)
			.where(sql`${table.convertedOrderId} is not null`),
		check(
			"quote_estimates_revision_positive_check",
			sql`${table.sequence} > 0 and ${table.revision} > 0`,
		),
		check(
			"quote_estimates_amounts_check",
			sql`${table.subtotalCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} = ${table.subtotalCents} + ${table.taxCents}`,
		),
		check(
			"quote_estimates_conversion_target_check",
			sql`(
				(${table.status} = 'converted' and (case when ${table.convertedInvoiceId} is null then 0 else 1 end + case when ${table.convertedOrderId} is null then 0 else 1 end) = 1)
				or
				(${table.status} <> 'converted' and ${table.convertedInvoiceId} is null and ${table.convertedOrderId} is null)
			)`,
		),
	],
);

export const quoteEstimateLineItems = pgTable(
	"quote_estimate_line_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		quoteEstimateId: uuid("quote_estimate_id")
			.notNull()
			.references(() => quoteEstimates.id, { onDelete: "cascade" }),
		catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
			onDelete: "set null",
		}),
		catalogItemVariantId: uuid("catalog_item_variant_id").references(
			() => catalogItemVariants.id,
			{ onDelete: "set null" },
		),
		variantOptions: jsonb("variant_options")
			.$type<Array<{ name: string; value: string }>>()
			.notNull()
			.default([]),
		name: text("name").notNull(),
		description: text("description"),
		itemType: text("item_type", {
			enum: ["physical", "digital", "service", "package", "rental"],
		}).notNull(),
		sku: text("sku"),
		quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
		unitLabel: text("unit_label"),
		unitPriceCents: integer("unit_price_cents").notNull(),
		lineTotalCents: integer("line_total_cents").notNull(),
		position: integer("position").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(table) => [
		index("quote_estimate_line_items_quote_idx").on(table.quoteEstimateId),
		index("quote_estimate_line_items_catalog_idx").on(table.catalogItemId),
		index("quote_estimate_line_items_variant_idx").on(
			table.catalogItemVariantId,
		),
		check(
			"quote_estimate_line_items_amounts_check",
			sql`${table.quantity} > 0 and ${table.unitPriceCents} >= 0 and ${table.lineTotalCents} >= 0`,
		),
	],
);
