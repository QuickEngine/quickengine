import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// QuickEngine is the account layer; QuickDash is the single flagship product.
// Everything once planned as a separate app (QuickFlow, QuickTools, and the
// utility apps) now lives as a module inside QuickDash, not as its own app.
export type QuickEngineAppId = "quickengine" | "quickdash";

// The self-serve tier ladder, plus a custom conversation at the top.
//
// ⚠️ `enterprise` is the STORED name for what the pricing ladder now calls
// "Custom". Renaming it would rewrite a persisted column value, so it stays
// until someone decides that migration is worth running. Display names live in
// `plans.ts`; nothing user-facing reads this string.
export type QuickEnginePlanId =
	| "free"
	| "launch"
	| "grow"
	| "scale"
	| "teams"
	| "enterprise"
	// Internal only — never sold, never shown on the pricing page. Assigned by
	// hand. See `plans.ts`.
	| "bypass";

export type QuickEngineBillingCycle = "monthly" | "annual";

export type QuickEngineSubscriptionStatus =
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "incomplete";

// Org-level roles (the account/team tier). Kept primitive per the roadmap;
// expandable. Workspace-level roles are a later refinement.
export type QuickEngineOrgRole = "owner" | "admin" | "member";

// Public API credential categories, fixed by the Quick.js SDK's QuickCredential
// union. Publishable is website-safe and read-only; secret/scoped are server-only.
/**
 * The four credential classes, in ascending order of what they can do.
 *
 * · `publishable` — names a workspace. Ships in page source. Reads the catalog
 *   and reports telemetry, nothing more.
 * · `storefront` — a merchant's own website. Ships in page source too, but may
 *   CHECK OUT: create an order and a charge. Safe only because the server prices
 *   everything from its own catalog; see `STOREFRONT_CAPABILITIES`.
 * · `scoped` — a trusted backend, holding whatever capabilities were granted.
 * · `secret` — full workspace access. Server only, never a browser.
 */
export type QuickEngineApiKeyType =
	| "publishable"
	| "storefront"
	| "secret"
	| "scoped";

// Lifecycle of an org invitation: created → accepted, or revoked/expired without use.
export type QuickEngineInvitationStatus =
	| "pending"
	| "accepted"
	| "revoked"
	| "expired";

export const quickengineUsers = pgTable("quickengine_users", {
	id: text("id").primaryKey(),
	/**
	 * The display name, and Better Auth's own column.
	 *
	 * ⚠️ KEPT, and kept authoritative. It is `notNull`, Better Auth writes it on
	 * social signup, and `ensurePersonalOrg` reads it. `firstName`/`lastName` are
	 * additions that COMPOSE into this, never a replacement for it — dropping it
	 * would mean rewriting the auth adapter to satisfy a form layout.
	 */
	name: text("name").notNull(),
	/**
	 * The two halves, stored separately because they are used separately: a
	 * greeting wants the first name alone, an invoice wants both, and splitting
	 * `name` on a space gets it wrong for everybody with two given names or a
	 * compound surname.
	 *
	 * Nullable: anybody who signed up before this, or through a provider that
	 * hands back a single string, has a `name` and no split.
	 */
	firstName: text("first_name"),
	lastName: text("last_name"),
	/**
	 * What the product should call them, when it is talking TO them.
	 *
	 * Distinct from `name`, which is what it calls them when talking ABOUT them —
	 * on an invoice, in an audit entry, to a teammate. Somebody called Alexander
	 * on both may still want "Morning, Alex".
	 */
	nickname: text("nickname"),
	/**
	 * An IANA zone, e.g. `America/Edmonton`.
	 *
	 * 🔑 Not decoration. Every date the product renders or EMAILS is currently
	 * resolved from whatever browser happens to be open — which is nothing at all
	 * for a receipt sent by a cron job. Detected silently at onboarding and
	 * correctable in settings.
	 */
	timezone: text("timezone"),
	/**
	 * An ISO 3166-1 alpha-2 code, e.g. `CA`.
	 *
	 * 🔑 Paired with the language it produces the formatting LOCALE — `en-CA`
	 * writes 2026-09-01 as 01/09/2026 and `en-US` as 09/01/2026, and the same
	 * split decides thousands separators and currency placement. Every money and
	 * date string in the product is formatted through `Intl`, so this is the
	 * difference between a date being read correctly and being read backwards.
	 *
	 * ⚠️ The CODE, never the display name. Names are localised and change; the
	 * code is stable and `Intl.DisplayNames` renders it in whatever language the
	 * reader is using.
	 */
	country: text("country"),
	/**
	 * A BCP 47 language subtag, e.g. `en`.
	 *
	 * ⚠️ Stored apart from `country` on purpose. The formatting locale is the two
	 * of them joined — `en` + `CA` is `en-CA` — and they genuinely vary
	 * independently: somebody in Montreal may want French dates on Canadian
	 * paper sizes. Storing the joined string instead would make either half
	 * impossible to change without re-parsing it.
	 */
	language: text("language"),
	/**
	 * Light, dark or follow the device.
	 *
	 * ⚠️ The theme already persists in a COOKIE on the parent domain, which is
	 * what carries it between QuickDash, Account and the marketing site. This
	 * column does NOT replace that and must never be read at boot — a network
	 * round trip before first paint is exactly the flash of the wrong theme that
	 * the inline script in `index.html` exists to prevent.
	 *
	 * It exists so the choice survives a NEW DEVICE, where there is no cookie to
	 * read. The cookie stays authoritative for the current browser.
	 */
	theme: text("theme", { enum: ["light", "dark", "system"] }),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	/**
	 * The wide image behind the avatar on a person's profile.
	 *
	 * ⚠️ A column rather than a reuse of `image`, because they are different
	 * shapes with different lifetimes — an avatar is square and follows the person
	 * everywhere in the product, a banner is 3:1 and appears on one screen. One
	 * column holding whichever was uploaded last is how a header ends up showing
	 * somebody's face stretched across it.
	 *
	 * Nullable and stays that way: a profile with no banner is a normal profile,
	 * not an incomplete one.
	 */
	bannerImage: text("banner_image"),
	role: text("role").default("member").notNull(),
	// Set by the Better Auth two-factor plugin once a user finishes TOTP setup.
	twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
	// Business/company name set during onboarding; shown as the account name in
	// the app header. Null until the user names their business.
	companyName: text("company_name"),
	onboardingCompletedAt: timestamp("onboarding_completed_at", {
		withTimezone: true,
	}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

// A workspace = a scoped QuickDash instance tied to one business type, with a
// chosen set of enabled modules. Created during onboarding (and later from
// "New Workspace").
export const quickengineWorkspaces = pgTable(
	"quickengine_workspaces",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		// The org this workspace belongs to. Nullable so the column adds without a
		// backfill; new workspaces always set it (see onboarding).
		organizationId: uuid("organization_id").references(
			() => quickengineOrganizations.id,
			{ onDelete: "cascade" },
		),
		name: text("name").notNull(),
		// URL-safe identifier, unique per owner (the display name is NOT unique).
		// Nullable so the column adds without backfilling old rows; new workspaces
		// always get one generated (see the account app's slug helpers).
		slug: text("slug"),
		businessType: text("business_type").notNull(),
		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),
		/**
		 * Is the shop open to the public?
		 *
		 * ── Why this is separate from `environment` ──────────────────────────────
		 *
		 * 🔴 These answer different questions and conflating them creates the one
		 * genuinely dangerous state.
		 *
		 * `environment` says whether MONEY is real. `published` says whether
		 * STRANGERS can buy. A test-mode shop that is still reachable will happily
		 * take a real customer's order and charge them nothing — they get a
		 * confirmation, the business gets an order it was never paid for, and
		 * nobody finds out until someone chases a delivery.
		 *
		 * Splitting them means a business can rehearse a full checkout (test money,
		 * shop closed) and later take the shop down for maintenance without
		 * touching its payment configuration at all.
		 *
		 * ⚠️ Defaults to published: every existing workspace is already trading,
		 * and a migration that quietly closed live shops would be an outage.
		 */
		published: boolean("published").notNull().default(true),
		modules: jsonb("modules").$type<string[]>().notNull().default([]),
		/**
		 * Everything a workspace configures that is not a MODULE's own setting.
		 *
		 * 🔑 One blob, not a column per switch. These are checkout rules, return
		 * windows, which events email you, how long data is kept — dozens of small
		 * booleans and numbers that arrive a few at a time as features land. A
		 * column each would mean a migration per toggle; a table of key/value rows
		 * would mean reassembling an object on every read and losing types.
		 *
		 * ⚠️ The SHAPE is enforced in code, by `workspaceSettingsSchema`, not by
		 * the database. Postgres validates nothing here, so every read parses and
		 * every write is parsed before it lands — an unparsed blob is how a typo
		 * becomes a setting nobody can find again.
		 *
		 * 🔴 Module settings do NOT live here. Those belong to the module that
		 * owns them, in `workspace_modules.settings`, and go away with it.
		 */
		settings: jsonb("settings")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		// Archiving removes a workspace from normal operation without deleting any
		// module data. Permanent deletion remains a separate explicit action.
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("quickengine_workspaces_owner_idx").on(table.ownerId),
		uniqueIndex("quickengine_workspaces_owner_slug_idx").on(
			table.ownerId,
			table.slug,
		),
	],
);

export const quickengineSessions = pgTable("quickengine_sessions", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => quickengineUsers.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const quickengineAccounts = pgTable("quickengine_accounts", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => quickengineUsers.id, { onDelete: "cascade" }),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", {
		withTimezone: true,
	}),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
		withTimezone: true,
	}),
	scope: text("scope"),
	idToken: text("id_token"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const quickengineVerifications = pgTable("quickengine_verifications", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

// Two-factor (TOTP) secrets + recovery codes. JS property keys MUST match the
// Better Auth two-factor plugin's field names (secret, backupCodes, …); the
// DB columns stay snake_case. `secret`/`backupCodes` are never returned to the
// client by the plugin. `lockedUntil` backs the plugin's failed-attempt lockout.
export const quickengineTwoFactors = pgTable(
	"quickengine_two_factors",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		secret: text("secret").notNull(),
		backupCodes: text("backup_codes").notNull(),
		verified: boolean("verified").default(true).notNull(),
		failedVerificationCount: integer("failed_verification_count")
			.default(0)
			.notNull(),
		lockedUntil: timestamp("locked_until", { withTimezone: true }),
	},
	(table) => [
		index("quickengine_two_factors_user_idx").on(table.userId),
		index("quickengine_two_factors_secret_idx").on(table.secret),
	],
);

// WebAuthn passkeys. The JS property keys MUST match the Better Auth passkey
// plugin's field names (publicKey, credentialID, deviceType, …) because the
// drizzle adapter maps by property name; the DB columns stay snake_case.
export const quickenginePasskeys = pgTable(
	"quickengine_passkeys",
	{
		id: text("id").primaryKey(),
		name: text("name"),
		publicKey: text("public_key").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("device_type").notNull(),
		backedUp: boolean("backed_up").notNull(),
		transports: text("transports"),
		aaguid: text("aaguid"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("quickengine_passkeys_user_idx").on(table.userId),
		index("quickengine_passkeys_credential_idx").on(table.credentialID),
	],
);

// An organization = the ACCOUNT / team container (billing + membership live here).
// Every user gets a `personal` org auto-created on signup (their solo space); they
// can also create or be invited to shared orgs. Workspaces belong to an org. This
// is the Vercel model: one login, many orgs, switched via a scope switcher.
export const quickengineOrganizations = pgTable("quickengine_organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	// A user's private, auto-created solo account. Shared orgs are false.
	isPersonal: boolean("is_personal").default(false).notNull(),
	ownerId: text("owner_id")
		.notNull()
		.references(() => quickengineUsers.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

// Who belongs to an org + their role. Owner is a member row too (role "owner").
// This is what "seats" counts. Unique per (org, user).
/**
 * Custom roles an organization defines for itself.
 *
 * The built-in `owner`/`admin`/`member` stay in code and are never rows here — they
 * must exist for every org, cannot be renamed, and `owner` must never be editable
 * or an org could lock itself out of its own billing.
 *
 * `quickengine_organization_members.role` holds either a built-in name or a custom
 * one from this table, which is why that column is `text` rather than an enum.
 * Resolution checks built-ins first, so a custom role can never shadow one.
 *
 * Capabilities are stored as a plain string array validated against
 * `WORKSPACE_CAPABILITIES` on write. Storing names rather than a bitmask keeps rows
 * readable in the database and means adding a capability never rewrites existing
 * rows.
 */
export const quickengineOrganizationRoles = pgTable(
	"quickengine_organization_roles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => quickengineOrganizations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("organization_roles_org_idx").on(table.organizationId),
		// Case-insensitive, so "Bookkeeper" and "bookkeeper" cannot both exist and
		// leave members pointing at an ambiguous name.
		uniqueIndex("organization_roles_name_unique").on(
			table.organizationId,
			sql`lower(${table.name})`,
		),
	],
);

export const quickengineOrganizationMembers = pgTable(
	"quickengine_organization_members",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => quickengineOrganizations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		// Widened past the built-in three once organizations could define their own
		// roles. The column was always plain text with no database constraint; the
		// narrow type was a claim the data never enforced, and a member holding a
		// custom role is now legitimate. Authorization reads capabilities, never this.
		role: text("role").notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("quickengine_org_members_org_user_idx").on(
			table.organizationId,
			table.userId,
		),
		index("quickengine_org_members_user_idx").on(table.userId),
	],
);

export const quickengineSubscriptions = pgTable(
	"quickengine_subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// Who set the subscription up (optional). Billing is ORG-scoped — the organization,
		// not the user, is the billing entity, so this is nullable.
		userId: text("user_id").references(() => quickengineUsers.id),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => quickengineOrganizations.id, { onDelete: "cascade" }),
		planId: text("plan_id")
			.$type<QuickEnginePlanId>()
			.notNull()
			.default("free"),
		status: text("status")
			.$type<QuickEngineSubscriptionStatus>()
			.notNull()
			.default("active"),
		billingCycle: text("billing_cycle").$type<QuickEngineBillingCycle>(),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		currentPeriodEndsAt: timestamp("current_period_ends_at", {
			withTimezone: true,
		}),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// One subscription per organization — the real billing invariant.
		uniqueIndex("quickengine_subscriptions_org_idx").on(table.organizationId),
	],
);

// Usage counters for the metering engine. Metered PER ACCOUNT (scopeId = the
// owning user id today). One row per (account, meter, period): COUNTERS (actions)
// get a fresh row each billing period and are incremented; GAUGES (storage/seats/
// workspaces) keep a single sentinel-period row holding the current total. See
// @quickengine/billing metering.
export const quickengineUsage = pgTable(
	"quickengine_usage",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		scopeId: text("scope_id").notNull(),
		// "actions" | "storageBytes" | "seats" | "workspaces".
		meter: text("meter").notNull(),
		periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
		periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
		// Accumulated value (counter) or current total (gauge). bigint for bytes.
		value: bigint("value", { mode: "number" }).notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("quickengine_usage_scope_meter_period_idx").on(
			table.scopeId,
			table.meter,
			table.periodStart,
		),
	],
);

// Workspace-scoped credentials for the public QuickDash API + Quick.js. Only the
// sha256 hash of the full key is stored — never the raw secret — mirroring the
// contracts signer-token pattern. `prefix` holds the non-secret leading chars shown
// in Account so operators can tell keys apart. `capabilities` narrows what the key
// may do (e.g. ["catalog:read"]); publishable keys are further limited to a read-only
// allowlist in the verification layer. See internal/product/API_KEYS.md.
export const quickengineApiKeys = pgTable(
	"quickengine_api_keys",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => quickengineUsers.id),
		name: text("name").notNull(),
		type: text("type").$type<QuickEngineApiKeyType>().notNull(),
		prefix: text("prefix").notNull(),
		keyHash: text("key_hash").notNull().unique(),
		capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
		/**
		 * Browser origins allowed to use this key, e.g. `https://gemsutopia.com`.
		 *
		 * 🔴 Lives on the KEY, not in an environment variable. The API's global
		 * `corsOrigins` allowlist is fine for our own surfaces, but a storefront key
		 * belongs to a customer's own domain — a global list would mean redeploying
		 * the API every time somebody connects a site.
		 *
		 * Empty means "no browser may use this key", which is the correct default
		 * for server credentials: a secret key has no business being called from a
		 * page, and an empty list makes that structural rather than advisory.
		 *
		 * ⚠️ Compared by exact ORIGIN — scheme, host and port. Never by suffix. A
		 * `endsWith` check would accept `https://gemsutopia.com.evil.com`.
		 */
		allowedOrigins: jsonb("allowed_origins")
			.$type<string[]>()
			.notNull()
			.default([]),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("quickengine_api_keys_workspace_idx").on(table.workspaceId),
	],
);

// Pending invitations to join an organization with a given role. The accept link carries a
// one-time token; only its sha256 hash is stored (never the raw token), mirroring the API-key
// and contracts signer-token pattern. Redeeming a valid token creates the membership row.
// A shared "redeemable link" primitive (referrals/affiliates) may be extracted from this
// later — see internal/planning/BACKLOG.md.
export const quickengineOrganizationInvitations = pgTable(
	"quickengine_organization_invitations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => quickengineOrganizations.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		// Widened past the built-in three once organizations could define their own
		// roles. The column was always plain text with no database constraint; the
		// narrow type was a claim the data never enforced, and a member holding a
		// custom role is now legitimate. Authorization reads capabilities, never this.
		role: text("role").notNull().default("member"),
		invitedByUserId: text("invited_by_user_id")
			.notNull()
			.references(() => quickengineUsers.id),
		tokenHash: text("token_hash").notNull().unique(),
		status: text("status")
			.$type<QuickEngineInvitationStatus>()
			.notNull()
			.default("pending"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		acceptedByUserId: text("accepted_by_user_id").references(
			() => quickengineUsers.id,
		),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("quickengine_org_invitations_org_idx").on(table.organizationId),
		index("quickengine_org_invitations_email_idx").on(table.email),
	],
);

// Per-user state for QuickDash's first-value checklist. Individual steps are derived from
// workspace records until the first complete pass; completedAt then makes onboarding one-time.
export const quickdashFirstActionStates = pgTable(
	"quickdash_first_action_states",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		checklistVersion: integer("checklist_version").notNull(),
		collapsed: boolean("collapsed").default(false).notNull(),
		dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("quickdash_first_action_states_user_workspace_idx").on(
			table.userId,
			table.workspaceId,
		),
	],
);

/**
 * Prepaid AI credit movements — **append-only, one row per movement.**
 *
 * **The balance is derived by summing this table, never stored.** A mutable
 * balance column is a number that can drift with no way to tell when or why, and
 * this is the number a customer will eventually dispute. Summing rows means the
 * balance can always be *explained* rather than merely read: every top-up,
 * draw-down, refund, correction and expiry is a row that says who did what, when,
 * and against which run.
 *
 * **Micros, not cents.** One AI action costs roughly $0.003 — three tenths of a
 * cent — so integer cents cannot represent a single unit of the thing being sold.
 * Micros (1,000,000 = $1) match `costMicros` in `@quickengine/agent-core`, which is
 * already how AI spend is measured, so no conversion sits between the meter and
 * the ledger where a rounding error could hide.
 *
 * **Signed.** Credits are positive, spend is negative. A refund is a positive row
 * rather than the deletion of a negative one, because the history of what happened
 * is the asset here — nothing is ever rewritten or removed.
 */
/**
 * Auto-recharge settings, one row per organization.
 *
 * Its own table rather than columns on the organization: this is a **standing
 * authorisation to take money**, and keeping it separate means it can be revoked,
 * audited and reasoned about on its own terms rather than buried among unrelated
 * fields. Opt-in only, and absent by default — no row means off.
 */
export const quickengineCreditAutoRecharge = pgTable(
	"quickengine_credit_auto_recharge",
	{
		organizationId: uuid("organization_id")
			.primaryKey()
			.references(() => quickengineOrganizations.id, { onDelete: "cascade" }),
		enabled: boolean("enabled").notNull().default(false),
		/** Recharge when the balance falls below this. */
		thresholdMicros: bigint("threshold_micros", { mode: "number" })
			.notNull()
			.default(0),
		/** How much to buy each time, in cents, to match Stripe. */
		amountCents: integer("amount_cents").notNull().default(0),
		/** The saved card to charge off-session. */
		stripePaymentMethodId: text("stripe_payment_method_id"),
		/**
		 * When the last attempt failed, and why.
		 *
		 * A failed off-session charge disables auto-recharge rather than retrying:
		 * expired cards and challenges that need the customer present do not fix
		 * themselves, and retrying a declining card is how an account collects forty
		 * declines and a fraud flag.
		 */
		lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
		lastFailureReason: text("last_failure_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
);

export const quickengineCreditEntries = pgTable(
	"quickengine_credit_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => quickengineOrganizations.id, { onDelete: "cascade" }),
		/**
		 * Which workspace spent it, when a workspace did. Null for account-level
		 * movements like a top-up, which belong to the organization rather than to
		 * any one of its workspaces. This is what the per-workspace spend cap counts.
		 */
		workspaceId: uuid("workspace_id").references(
			() => quickengineWorkspaces.id,
			{ onDelete: "set null" },
		),
		/** `topup` · `spend` · `refund` · `adjustment` · `expiry` */
		kind: text("kind").notNull(),
		/** Signed. Positive adds balance, negative consumes it. */
		amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
		/** Human-readable reason, shown to the customer on their statement. */
		description: text("description"),
		/**
		 * The agent run this paid for, when it paid for one. Lets a disputed charge
		 * be traced back to the exact run rather than argued about in the abstract.
		 */
		agentRunId: text("agent_run_id"),
		/** Stripe payment intent for a top-up. */
		stripePaymentIntentId: text("stripe_payment_intent_id"),
		/**
		 * The entry this one cancels. Set on `expiry` and `refund` rows so a negative
		 * movement can always be reconciled against what it reversed, and so expiry
		 * can tell which credits it has already cancelled.
		 */
		sourceEntryId: uuid("source_entry_id"),
		/**
		 * When this credit stops counting toward the balance. Null means it never
		 * expires. Nullable so either expiry policy works without a migration —
		 * whether credits expire is a pricing decision, not a schema one.
		 */
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// The balance query: every entry for an organization.
		index("credit_entries_org_idx").on(table.organizationId, table.createdAt),
		// The per-workspace spend cap query.
		index("credit_entries_workspace_idx").on(
			table.workspaceId,
			table.createdAt,
		),
		index("credit_entries_source_idx").on(table.sourceEntryId),
		// A top-up must never be applied twice. Stripe retries webhooks, so without
		// this a network hiccup on their side becomes free credit on ours. Partial,
		// because only top-ups carry a payment intent.
		uniqueIndex("credit_entries_payment_intent_unique")
			.on(table.stripePaymentIntentId)
			.where(sql`${table.stripePaymentIntentId} is not null`),
	],
);
