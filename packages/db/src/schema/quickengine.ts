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

export type QuickEngineAppId =
	| "quickengine"
	| "quickdash"
	| "quickflow"
	| "pdf-tools"
	| "image-tools"
	| "web-tools"
	| "text-tools"
	| "dev-tools"
	| "converters"
	| "business-tools"
	| "productivity"
	| "ai-tools"
	| "health"
	| "video-audio";

export type QuickEnginePlanId = "free" | "individual" | "suite" | "business";

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

export const quickengineApps = pgTable("quickengine_apps", {
	id: text("id").$type<QuickEngineAppId>().primaryKey(),
	name: text("name").notNull(),
	category: text("category").notNull(),
	status: text("status").notNull().default("planned"),
	publicUrl: text("public_url"),
	adminUrl: text("admin_url"),
	metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
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
		appId: text("app_id")
			.$type<QuickEngineAppId>()
			.references(() => quickengineApps.id),
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
		index("quickengine_subscriptions_app_idx").on(table.appId),
	],
);

export const quickengineEntitlements = pgTable(
	"quickengine_entitlements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		appId: text("app_id")
			.$type<QuickEngineAppId>()
			.notNull()
			.references(() => quickengineApps.id),
		source: text("source").notNull().default("subscription"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("quickengine_entitlements_user_app_unique").on(
			table.userId,
			table.appId,
		),
		index("quickengine_entitlements_user_idx").on(table.userId),
	],
);
