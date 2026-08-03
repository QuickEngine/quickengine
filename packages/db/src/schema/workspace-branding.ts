import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// HOW A BUSINESS APPEARS TO ITS OWN CUSTOMERS.
//
// 🔴 The customer-facing surfaces are not QuickEngine's. A receipt for a
// Gemsutopia order is from Gemsutopia; the shopper has no relationship with us
// and must not learn of one from a transactional email or a portal header.
//
// Until this table existed, `brandFor()` in the notification handler fell back
// to `support@quickdash.xyz` — the last place the platform showed through in a
// customer's inbox. That fallback is the reason this exists.
//
// One row per workspace, created lazily: a workspace with no row still works,
// it just falls back to its own name and the platform support address.
// ─────────────────────────────────────────────────────────────────────────────

export const workspaceBranding = pgTable(
	"workspace_branding",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.unique()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/**
		 * The portal URL segment — `portal.quickdash.xyz/<slug>`.
		 *
		 * ⚠️ GLOBALLY unique, unlike `quickengine_workspaces.slug`, which is only
		 * unique per owner (`quickengine_workspaces_owner_slug_idx`) and nullable.
		 * Two owners may each call a workspace "gemsutopia"; two portals cannot
		 * share a URL. Reusing the workspace slug here would hand one business's
		 * customers to another the first time the names collided.
		 */
		portalSlug: text("portal_slug").notNull().unique(),

		/**
		 * A domain the business owns, pointed at the portal — `account.gemsutopia.com`.
		 *
		 * Null for everyone today; path-based routing ships first because it needs
		 * one CNAME and no wildcard certificate. Host and path resolution coexist,
		 * so filling this in later is additive.
		 */
		customDomain: text("custom_domain").unique(),

		/**
		 * Off by default.
		 *
		 * A workspace that has never configured a portal should 404 rather than
		 * serve a half-branded page carrying its internal name. Enabling is a
		 * deliberate act in Connect.
		 */
		portalEnabled: boolean("portal_enabled").notNull().default(false),

		// ── What the customer sees ──────────────────────────────────────────────
		// All nullable. Absent means "fall back", never "show blank" — see
		// `resolveBrand()`, which is the only place the fallbacks are decided.

		/** Overrides the workspace name. A workspace may be named "Gems — main". */
		displayName: text("display_name"),
		/** 🔴 Where replies go. The whole point of the table. Never our address. */
		supportEmail: text("support_email"),
		/** Absolute URL. Mail clients cannot resolve a relative path. */
		logoUrl: text("logo_url"),
		/**
		 * The browser-tab icon for the hosted portal.
		 *
		 * ⚠️ Swapped at RUNTIME by rewriting the `<link rel="icon">` href once
		 * bootstrap resolves, because one deployment serves every workspace and a
		 * static `index.html` can only ship one. Expect a frame of the default
		 * icon first; there is no way around that without a build per customer.
		 *
		 * Portal only. Email has no favicon.
		 */
		faviconUrl: text("favicon_url"),
		tagline: text("tagline"),
		/**
		 * ⚠️ Solid hex only (`#7c3aed`). Mail clients discard `oklch()` and custom
		 * properties, so the app's theme tokens cannot cross into email — see
		 * `packages/email/src/templates/brand.ts`.
		 */
		accentColor: text("accent_color"),
		websiteUrl: text("website_url"),

		/**
		 * ⚠️ UNUSED. Nothing reads this and no surface renders attribution.
		 *
		 * A "powered by QuickDash" footer, removable by paying, was considered and
		 * **dropped** on 2026-08-03 — see `internal/planning/DECISIONS.md`. The
		 * column survives only because it had already been applied to both
		 * databases when the idea was withdrawn; declaring it here keeps the schema
		 * honest so `db:generate` does not emit a surprise `DROP COLUMN`.
		 *
		 * Safe to remove in a deliberate migration. Do not start reading it without
		 * revisiting the decision first: Hard rule 4 forbids advertising inside the
		 * product, and the published changelog promises customers we are not
		 * mentioned in their mail.
		 */
		hideAttribution: boolean("hide_attribution").notNull().default(false),

		/**
		 * The portal's publishable key, IN PLAINTEXT.
		 *
		 * 🔴 A deliberate exception to `quickengine_api_keys`, which stores only
		 * `key_hash`. That hash exists so a leaked database cannot yield working
		 * SECRET keys. A publishable key is the opposite kind of thing: it names a
		 * workspace, carries the read-only capability allowlist, can never move
		 * money, and is designed to sit in public page source. Stripe ships theirs
		 * the same way.
		 *
		 * It is stored because the portal must fetch it at runtime. One build
		 * cannot embed a hundred customers' keys, and a hash cannot be handed back.
		 *
		 * ⚠️ A SECRET key must never be written here. `issueApiKey` clamps
		 * capabilities by type, and the write path asserts the `qpk_` prefix.
		 */
		portalPublishableKey: text("portal_publishable_key"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("workspace_branding_workspace_idx").on(table.workspaceId)],
);
