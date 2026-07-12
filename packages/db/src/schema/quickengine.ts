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

// The self-serve tier ladder, plus Enterprise as a custom conversation.
export type QuickEnginePlanId =
	| "free"
	| "starter"
	| "pro"
	| "growth"
	| "team"
	| "enterprise";

export type QuickEngineBillingCycle = "monthly" | "annual";

export type QuickEngineSubscriptionStatus =
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "incomplete";

export const quickengineUsers = pgTable("quickengine_users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
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
		name: text("name").notNull(),
		// URL-safe identifier, unique per owner (the display name is NOT unique).
		// Nullable so the column adds without backfilling old rows; new workspaces
		// always get one generated (see the account app's slug helpers).
		slug: text("slug"),
		businessType: text("business_type").notNull(),
		modules: jsonb("modules").$type<string[]>().notNull().default([]),
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

export const quickengineOrganizations = pgTable("quickengine_organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
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

export const quickengineSubscriptions = pgTable(
	"quickengine_subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id),
		organizationId: uuid("organization_id").references(
			() => quickengineOrganizations.id,
			{ onDelete: "cascade" },
		),
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
		index("quickengine_subscriptions_user_idx").on(table.userId),
		index("quickengine_subscriptions_org_idx").on(table.organizationId),
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
