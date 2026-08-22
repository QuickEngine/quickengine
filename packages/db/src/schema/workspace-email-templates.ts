import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// A BUSINESS'S OWN WORDS, over the built-in ones.
//
// 🔴 Only the WORDS are overridable — a subject, a heading, an opening line.
// Never the structure. Line items, totals, tracking numbers and buttons stay
// generated, because they are facts about an order rather than copy, and a
// business that could edit them could send a receipt that disagrees with what
// was charged.
//
// ⚠️ Deliberately not raw HTML. Mail clients are the least forgiving rendering
// targets in software: no flexbox, no custom properties, table layout only.
// Handing over the markup means a business can silently break its own receipts
// in Outlook and find out from a customer. Structured fields keep the layout
// intact and still let someone sound like themselves.
//
// One row per workspace per template. No row means the built-in copy, which is
// the state every workspace starts in and most will stay in.
// ─────────────────────────────────────────────────────────────────────────────

export const workspaceEmailTemplates = pgTable(
	"workspace_email_templates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/**
		 * Which email. Matches `EmailTemplateKey` in the email package.
		 *
		 * ⚠️ Plain text, not an enum: templates are added far more often than
		 * migrations should be, and an unknown key simply falls back to built-in
		 * copy rather than breaking a send.
		 */
		templateKey: text("template_key").notNull(),

		/** Null means keep the built-in. Empty string is stored as null. */
		subject: text("subject"),

		/**
		 * The WHOLE email, as HTML the business wrote itself.
		 *
		 * 🔴 The entire document, shell included. A business that wants a different
		 * layout, different colours or no logo should not have to ask us, and every
		 * "safe subset" we could invent is a thing somebody eventually needs to
		 * work around. It starts as a copy of the built-in template, so editing is
		 * a change rather than an invention.
		 *
		 * ⚠️ `{{details}}` is substituted with the generated block: line items,
		 * totals, tracking. Those are facts about an order rather than copy, and a
		 * business able to hand-edit them could send a receipt that disagrees with
		 * what was charged. Omit the token and the details simply do not appear.
		 */
		html: text("html"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("workspace_email_templates_key_unique").on(
			table.workspaceId,
			table.templateKey,
		),
	],
);
