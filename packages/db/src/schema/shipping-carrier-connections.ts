import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// CARRIER CONNECTIONS — the credential and live state for one carrier account.
//
// `DECISIONS.md` 2026-08-21: a merchant brings their OWN carrier account, the
// same answer Stripe Connect gave, because that is what makes their negotiated
// carrier rates carry over. So the token belongs to the business and lives here,
// one row per workspace per carrier per environment.
//
// ⚠️ Shaped after `supplier_connections` on purpose, down to the status
// vocabulary. It is the same problem — a secret, a liveness state, and a last
// error somebody has to be able to read — and two different shapes for one
// problem is how the second one ends up missing what the first one learned.
//
// 🔴 Unlike suppliers, this carries ENVIRONMENT. A carrier issues separate test
// and live tokens, and they are not interchangeable: a test token cannot buy a
// real label, and a live one spends real money the first time somebody presses
// a button in a sandbox. Every other part of this system already separates the
// two, and a carrier connection that did not would be the hole in it.
// ─────────────────────────────────────────────────────────────────────────────

export const shippingCarrierConnections = pgTable(
	"shipping_carrier_connections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		/**
		 * Which adapter serves this connection: `shippo`, `easypost`.
		 *
		 * Plain `text` with the set enforced in TypeScript, matching
		 * `supplier_connections.provider` — adding a carrier needs no migration.
		 */
		carrier: text("carrier").notNull(),
		/**
		 * Whether this token spends real money.
		 *
		 * 🔴 Not derived from the workspace. A workspace can move between sandbox
		 * and live, and its carrier tokens do not move with it — they are issued
		 * separately and revoked separately. Deriving this would silently start
		 * using a test token for live labels the moment a workspace switched.
		 */
		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),
		/**
		 * The encrypted credential blob, `v1.<iv>.<tag>.<ciphertext>`.
		 *
		 * 🔴 Written and read only by `carrier-credentials.ts`, under its own HKDF
		 * domain. Nothing may select this column to display it: the safe read is
		 * `describeCarrierCredentials`, which answers whether a secret is present
		 * and never what it is.
		 */
		credentials: text("credentials"),
		/**
		 * `pending` until something has actually talked to the carrier, `active`
		 * once it has, `failed` when it stopped working.
		 *
		 * ⚠️ Not a boolean, for the same reason suppliers is not: "never tried" and
		 * "tried and broken" need different words on screen, and a business whose
		 * rates quietly stopped quoting deserves to be told which one it is.
		 */
		status: text("status", { enum: ["pending", "active", "failed"] })
			.notNull()
			.default("pending"),
		/** The last failure, in the carrier's own words, for an operator to read. */
		lastError: text("last_error"),
		lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		/**
		 * One connection per carrier per mode. Reconnecting updates it.
		 *
		 * ⚠️ `environment` is in the key so a business can hold a test and a live
		 * token at once, which is the normal state while somebody is proving an
		 * integration works before trusting it with real parcels.
		 */
		unique("shipping_carrier_connections_unique").on(
			table.workspaceId,
			table.carrier,
			table.environment,
		),
		index("shipping_carrier_connections_workspace_idx").on(table.workspaceId),
	],
);
