import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// REFERRALS — a customer bringing another customer.
//
// 🔴 Two tables because they answer two different questions. `referral_codes` is
// "what is MY code and what has it earned me" — one row per customer, read on
// every account page. `referrals` is "who came from whom, on which order, and
// what did it cost" — one row per event, and the only audit of money promised.
//
// Collapsing them would mean either recounting events on every page load or
// keeping a total with no evidence behind it.
// ─────────────────────────────────────────────────────────────────────────────

export const REFERRAL_REWARD_TYPES = ["fixed", "percentage"] as const;
export type ReferralRewardType = (typeof REFERRAL_REWARD_TYPES)[number];

export const REFERRAL_STATUSES = [
	// The referred customer has ordered, but the order is not settled. A reward
	// that pays out here is a reward paid on an order that may never be paid for.
	"pending",
	"completed",
	// The order was cancelled or refunded. Kept rather than deleted so a customer
	// gaming the system leaves a trail.
	"cancelled",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/**
 * One customer's referral code.
 *
 * ⚠️ Owned by a `client_record`, not by a `workspace_customer`. The client
 * record is what an ORDER points at, so a guest who checks out and later
 * verifies their email keeps the same referral identity — and a code earned
 * before signing in still belongs to them afterwards.
 */
export const referralCodes = pgTable(
	"referral_codes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		ownerClientRecordId: uuid("owner_client_record_id")
			.notNull()
			.references(() => clientRecords.id, { onDelete: "cascade" }),

		/**
		 * What the referrer shares.
		 *
		 * Stored uppercased and matched case-insensitively, like a discount code —
		 * somebody typing it off a screenshot must get the same answer.
		 */
		code: text("code").notNull(),

		/**
		 * Running totals, incremented with the referral rather than counted.
		 *
		 * ⚠️ Denormalised on purpose. "How much have I earned?" is on every account
		 * page, and summing `referrals` on each load is a scan that grows with the
		 * customer's success. The `referrals` rows remain authoritative if the two
		 * ever disagree.
		 */
		totalReferrals: integer("total_referrals").notNull().default(0),
		totalEarnedCents: integer("total_earned_cents").notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// One code per workspace — two shops may both hand out "SAM10".
		unique("referral_codes_workspace_code_key").on(
			table.workspaceId,
			table.code,
		),
		// One code per customer per workspace. A customer asking twice gets the
		// same code back rather than a second one their friends cannot use.
		unique("referral_codes_workspace_owner_key").on(
			table.workspaceId,
			table.ownerClientRecordId,
		),
		index("referral_codes_workspace_idx").on(table.workspaceId),
	],
);

/**
 * One referral event.
 *
 * 🔴 `referrerClientRecordId` and `referredClientRecordId` must differ, enforced
 * by the write path. Self-referral is the first thing anyone tries, and it is
 * free money if nothing checks.
 */
export const referrals = pgTable(
	"referrals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		referralCodeId: uuid("referral_code_id")
			.notNull()
			.references(() => referralCodes.id, { onDelete: "cascade" }),

		/** Who gets the reward. */
		referrerClientRecordId: uuid("referrer_client_record_id")
			.notNull()
			.references(() => clientRecords.id, { onDelete: "cascade" }),

		/** Who used the code. */
		referredClientRecordId: uuid("referred_client_record_id")
			.notNull()
			.references(() => clientRecords.id, { onDelete: "cascade" }),

		/**
		 * The order that triggered it.
		 *
		 * `set null` rather than cascade: deleting an order must not erase the
		 * record that a reward was promised, or a payout could be replayed by
		 * removing its evidence.
		 */
		orderId: uuid("order_id").references(() => orders.id, {
			onDelete: "set null",
		}),

		status: text("status", { enum: REFERRAL_STATUSES })
			.notNull()
			.default("pending"),

		/**
		 * What the referrer earns, SNAPSHOTTED at the moment of the referral.
		 *
		 * 🔴 Never recomputed from the workspace's current settings. A shop that
		 * cuts its reward from £10 to £5 must still honour what it promised on
		 * referrals already made — recomputing would retroactively reduce money
		 * somebody has already been told they earned.
		 */
		rewardType: text("reward_type", { enum: REFERRAL_REWARD_TYPES }).notNull(),
		rewardAmountCents: integer("reward_amount_cents").notNull(),

		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// 🔴 One referral per referred customer per workspace. Somebody cannot use a
		// second friend's code on their second order — the reward is for BRINGING a
		// customer, and a customer is only brought once.
		unique("referrals_workspace_referred_key").on(
			table.workspaceId,
			table.referredClientRecordId,
		),
		index("referrals_code_idx").on(table.referralCodeId),
		index("referrals_referrer_idx").on(table.referrerClientRecordId),
	],
);
