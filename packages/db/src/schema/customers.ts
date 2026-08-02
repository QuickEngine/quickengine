import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// END-CUSTOMER IDENTITY — the people who buy from our customers.
//
// 🔴 THIS IS NOT THE ACCOUNT LAYER. A `quickengine_user` is an operator: they
// sign into QuickDash, they belong to an organization, they consume a seat, and
// they are billed for. Everything here is the opposite — a shopper on a
// client's storefront. They must NEVER become a `quickengine_user`, or one
// workspace with four thousand customers would be a four-thousand-seat account
// that can sign into its owner's dashboard.
//
// Two namespaces, no overlap, enforced by these being separate tables with no
// foreign key between them.
//
// Tables are unprefixed, like the module tables and `client_records`. The
// `quickengine_` prefix marks the account layer specifically, and this is not
// it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A person, independent of any workspace.
 *
 * ⚠️ Email is unique GLOBALLY, not per workspace, and that is deliberate even
 * though the product behaves as though accounts are per-workspace today.
 * Sessions are workspace-scoped (see `customerSessions`), so a shopper only
 * ever sees the workspace they signed into — the separation is enforced at
 * authorization, not by duplicating the person.
 *
 * The payoff: switching to one-account-everywhere later is a UI that lists a
 * person's memberships. No migration, no re-registration. Putting the email on
 * the workspace-scoped table instead would make that a rebuild.
 *
 * Enumeration is handled by the flow rather than the schema: a sign-in request
 * answers identically whether or not the address is known, so a signup form on
 * one storefront cannot be used to probe another's customer list.
 */
export const customerIdentities = pgTable("customer_identities", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Stored lowercased and trimmed by the write path. Addresses are
	// case-insensitive in practice, and two rows differing only in case would be
	// two people as far as this table is concerned.
	email: text("email").notNull().unique(),
	// Null until a link is followed or an OAuth provider vouches for it. An
	// unverified identity can exist — it is created the moment a link is
	// requested — but it can never hold a session.
	emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

/**
 * A federated login attached to an identity.
 *
 * Separate from the identity so one person can hold several — Google today, a
 * second provider later — without a column per provider. `subject` is the
 * provider's own stable id for the user, never their email, because an email
 * can be reassigned and a subject cannot.
 */
export const customerIdentityProviders = pgTable(
	"customer_identity_providers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		identityId: uuid("identity_id")
			.notNull()
			.references(() => customerIdentities.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		subject: text("subject").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("customer_identity_provider_subject_key").on(
			table.provider,
			table.subject,
		),
		index("customer_identity_providers_identity_idx").on(table.identityId),
	],
);

/**
 * A person's membership of one workspace — the join that makes them a customer
 * OF somebody.
 *
 * `clientRecordId` is the whole point. `client_records` already holds the name,
 * addresses and notes, and `orders.client_id` already points at it, so linking
 * an identity to a client record means past orders appear with no data
 * migration whatever.
 *
 * That is also how a guest purchase is claimed: someone checks out as a guest,
 * a client record is created carrying their email, and when they later verify
 * that same address the membership binds to the record that already exists.
 * Their history is simply there. A verified email is proof enough of ownership
 * — it is the same evidence a password reset relies on.
 *
 * ⚠️ `clientRecordId` is nullable and NOT unique across the table on purpose.
 * Nullable because an identity can exist before a record does; not unique
 * because a workspace may legitimately merge records, and a hard constraint
 * would turn a merge into an outage.
 */
export const workspaceCustomers = pgTable(
	"workspace_customers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		identityId: uuid("identity_id")
			.notNull()
			.references(() => customerIdentities.id, { onDelete: "cascade" }),
		clientRecordId: uuid("client_record_id").references(
			() => clientRecords.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
	},
	(table) => [
		// One membership per person per workspace. Signing in again must find this
		// row, never add a second.
		unique("workspace_customers_workspace_identity_key").on(
			table.workspaceId,
			table.identityId,
		),
		index("workspace_customers_workspace_idx").on(table.workspaceId),
		index("workspace_customers_identity_idx").on(table.identityId),
		index("workspace_customers_client_record_idx").on(table.clientRecordId),
	],
);

/**
 * A signed-in customer session.
 *
 * 🔴 Keyed to the MEMBERSHIP, not the identity. This is the line that keeps
 * workspaces separate: a session presented to workspace A resolves to a
 * `workspace_customers` row belonging to workspace A, so it can never read
 * workspace B's data even though the same person may hold a membership there.
 * Scoping sessions to the identity instead would make every customer session a
 * cross-tenant one.
 *
 * Only a hash is stored. A leaked database must not yield usable session
 * tokens, and nothing ever needs the original back — verification hashes the
 * presented token and compares.
 */
export const customerSessions = pgTable(
	"customer_sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceCustomerId: uuid("workspace_customer_id")
			.notNull()
			.references(() => workspaceCustomers.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull().unique(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		// Set on explicit sign-out. Kept rather than deleted so "signed out from
		// another device" can be told apart from "never existed".
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("customer_sessions_customer_idx").on(table.workspaceCustomerId),
		index("customer_sessions_expires_idx").on(table.expiresAt),
	],
);

/**
 * A single-use sign-in link.
 *
 * Carries the workspace because the same address signing into two storefronts
 * must produce two distinct links — a token minted for one workspace must not
 * be redeemable at another.
 *
 * Hashed for the same reason as sessions. `consumedAt` rather than deletion so
 * a replayed link can answer "this link was already used" instead of the
 * indistinguishable "invalid link", which is what sends people to support.
 */
export const customerLoginTokens = pgTable(
	"customer_login_tokens",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		consumedAt: timestamp("consumed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("customer_login_tokens_workspace_email_idx").on(
			table.workspaceId,
			table.email,
		),
		index("customer_login_tokens_expires_idx").on(table.expiresAt),
	],
);
