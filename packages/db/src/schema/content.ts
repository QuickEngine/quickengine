import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT — named slots, not pages.
//
// 🔴 THE DESIGN DECISION, and the reason the first attempt failed: this does NOT
// model a page. No structure, no ordering of sections, no component tree, no
// drag and drop. The old QuickDash tried to model pages and drowned — modelling
// a page means modelling layout, which is what WordPress spent a decade on and
// was never what the customer asked for.
//
// A developer builds the site and declares which parts are editable:
// `about.body`, `legal.returns`, `home.hero.subtitle`. Those become rows. The
// operator gets a form of those slots; the site fetches them by key.
//
// The boundary that creates is the point: the client can rewrite every word and
// cannot break the layout, because layout was never theirs to touch.
//
// Full reasoning: `internal/planning/CONTENT_MODULE.md`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a slot holds.
 *
 * `richtext` is stored as a string like `text`; the distinction exists so the
 * operator's form knows to render an editor rather than an input, and so a
 * consumer knows whether it is safe to inject.
 */
export const CONTENT_TYPES = [
	"text",
	"richtext",
	"image",
	"url",
	"number",
	"boolean",
	"json",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const contentEntries = pgTable(
	"content_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/**
		 * The slot's name, as the site asks for it — `about.body`.
		 *
		 * Dotted for grouping, but opaque to us: nothing parses it. A developer
		 * choosing `aboutBody` gets exactly the same behaviour.
		 */
		key: text("key").notNull(),

		type: text("type", { enum: CONTENT_TYPES }).notNull().default("text"),

		/**
		 * Whether this slot holds one value or an ordered list of them.
		 *
		 * 🔴 Designed in from the start rather than added later, because FAQ and
		 * testimonials — two of the five things this module replaces — are lists.
		 * Retrofitting repeatability onto a scalar-only table is a migration, and
		 * the design note flagged it as the module's one real complexity.
		 *
		 * `single`: `value` is the value.
		 * `list`:   `value` is an array. Order is the array's order.
		 */
		kind: text("kind", { enum: ["single", "list"] })
			.notNull()
			.default("single"),

		/**
		 * The content.
		 *
		 * jsonb rather than text so one column serves every type and both kinds. A
		 * text slot stores a JSON string; a list stores an array. Uniform storage
		 * means the read path has no per-type branching.
		 */
		value: jsonb("value"),

		/**
		 * Off means the site does not see it.
		 *
		 * A half-written About section must not appear mid-sentence on a live page
		 * because somebody was interrupted. Draft edits stay invisible until
		 * published.
		 */
		published: boolean("published").notNull().default(false),

		// ── What the operator sees ────────────────────────────────────────────
		// `about.body` is a key; "About — body text" is a label. Without these the
		// form is a list of programmer strings.
		label: text("label"),
		description: text("description"),
		/** Groups slots into sections in the form. `About`, `Legal`, `Home`. */
		group: text("group"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// One slot per key per workspace. A site asking for `about.body` must get
		// exactly one answer.
		unique("content_entries_workspace_key_key").on(
			table.workspaceId,
			table.key,
		),
		index("content_entries_workspace_idx").on(table.workspaceId),
		// The storefront read is "every published slot for this workspace", which
		// is one query on page load and therefore worth an index of its own.
		index("content_entries_published_idx").on(
			table.workspaceId,
			table.published,
		),
	],
);
