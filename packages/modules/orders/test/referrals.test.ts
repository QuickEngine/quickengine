import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	cancelReferralsForOrder,
	completeReferralsForOrder,
	evaluateReferral,
	getReferralSummary,
	issueReferralCode,
	recordReferral,
	referralRewardCents,
} from "../src";

const ownerId = "referral-owner";
const workspaceId = "00000000-0000-4000-8000-0000000009f1";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000009f2";
const alice = "00000000-0000-4000-8000-0000000009f3";
const bob = "00000000-0000-4000-8000-0000000009f4";
const carol = "00000000-0000-4000-8000-0000000009f5";

const ON = {
	enabled: true,
	rewardType: "fixed" as const,
	rewardValue: 1_000,
};

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'R Owner', 'r@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Gems', 'custom'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'custom')`;
	await sql`
		insert into client_records (id, workspace_id, name, email) values
		(${alice}, ${workspaceId}, 'Alice', 'alice@example.com'),
		(${bob}, ${workspaceId}, 'Bob', 'bob@example.com'),
		(${carol}, ${workspaceId}, 'Carol', 'carol@example.com')
	`;
});

async function anOrder(clientId: string) {
	const sql = testDbClient();
	const id = crypto.randomUUID();
	await sql`
		insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, tax_cents, total_cents, status)
		values (${id}, ${workspaceId}, ${clientId}, 'Buyer', ${Math.floor(Math.random() * 1_000_000)}, ${`ORD-${id.slice(0, 8)}`}, 'USD', 10000, 0, 10000, 'draft')
	`;
	return id;
}

describe("issuing a code", () => {
	it("returns the same code every time it is asked for", async () => {
		// 🔴 A second code would break every link the customer already shared.
		const first = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const second = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		expect(second.code).toBe(first.code);
	});

	it("gives different customers different codes", async () => {
		const a = await issueReferralCode({ workspaceId, clientRecordId: alice });
		const b = await issueReferralCode({ workspaceId, clientRecordId: bob });
		expect(a.code).not.toBe(b.code);
	});

	it("avoids characters people misread off a screenshot", async () => {
		// No I, L, O or U — a referral code exists to be passed between humans.
		const { code } = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
	});
});

describe("the three rules that stop this being free money", () => {
	it("refuses a self-referral", async () => {
		const { code } = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const r = await evaluateReferral({
			workspaceId,
			code,
			referredClientRecordId: alice,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		expect(!r.ok && r.reason).toBe("SELF_REFERRAL");
	});

	it("refuses a second referral for the same customer", async () => {
		const aliceCode = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const carolCode = await issueReferralCode({
			workspaceId,
			clientRecordId: carol,
		});
		const first = await evaluateReferral({
			workspaceId,
			code: aliceCode.code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		await recordReferral({
			workspaceId,
			referralCodeId: first.referralCodeId,
			referrerClientRecordId: alice,
			referredClientRecordId: bob,
			orderId: await anOrder(bob),
			rewardType: first.rewardType,
			rewardAmountCents: first.rewardAmountCents,
		});

		// Bob now tries Carol's code on a second order. A customer is only
		// "brought" once.
		const second = await evaluateReferral({
			workspaceId,
			code: carolCode.code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		expect(!second.ok && second.reason).toBe("ALREADY_REFERRED");
	});

	/**
	 * 🔴 The abandoned checkout. A referral is written BEFORE payment, so a
	 * shopper whose card is declined leaves a `pending` row behind. Rejecting on
	 * that row meant they could never be referred again — the first order never
	 * settled so nobody was paid, and the retry carried no referral at all. The
	 * referrer lost the reward, silently, for somebody hesitating.
	 */
	it("lets the same referrer try again after a checkout was abandoned", async () => {
		const aliceCode = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const first = await evaluateReferral({
			workspaceId,
			code: aliceCode.code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		await recordReferral({
			workspaceId,
			referralCodeId: first.referralCodeId,
			referrerClientRecordId: alice,
			referredClientRecordId: bob,
			orderId: await anOrder(bob),
			rewardType: first.rewardType,
			rewardAmountCents: first.rewardAmountCents,
		});

		// Bob's payment failed. He comes back and uses Alice's code again.
		const retry = await evaluateReferral({
			workspaceId,
			code: aliceCode.code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		expect(retry.ok).toBe(true);
	});

	/**
	 * ⚠️ Retiring the stale row is what stops the reward being owed twice. It
	 * never pays on its own — settlement only touches the order that settled —
	 * but it would sit in the referrer's pending earnings as money that is never
	 * coming.
	 */
	it("retires the abandoned attempt rather than leaving it pending", async () => {
		const aliceCode = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const evaluated = await evaluateReferral({
			workspaceId,
			code: aliceCode.code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		if (!evaluated.ok) throw new Error("expected a referral");
		const shared = {
			workspaceId,
			referralCodeId: evaluated.referralCodeId,
			referrerClientRecordId: alice,
			referredClientRecordId: bob,
			rewardType: evaluated.rewardType,
			rewardAmountCents: evaluated.rewardAmountCents,
		};
		await recordReferral({ ...shared, orderId: await anOrder(bob) });
		const second = await anOrder(bob);
		await recordReferral({ ...shared, orderId: second });

		const sql = testDbClient();
		const rows = await sql`
			select status, order_id from referrals
			where workspace_id = ${workspaceId} and referred_client_record_id = ${bob}
		`;
		/**
		 * 🔴 ONE row, pointed at the order that is still live. `referrals` is
		 * unique on (workspace, customer), so the abandoned attempt cannot be left
		 * beside a new one — it has to move, or the reward stays pinned to an
		 * order that will never settle.
		 */
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("pending");
		expect(rows[0].order_id).toBe(second);
	});

	it("lets the database decide when two checkouts race", async () => {
		const { code, ...rest } = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		void rest;
		const evaluated = await evaluateReferral({
			workspaceId,
			code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		if (!evaluated.ok) throw new Error("expected a valid referral");

		const attempts = await Promise.all(
			[await anOrder(bob), await anOrder(bob), await anOrder(bob)].map(
				(orderId) =>
					recordReferral({
						workspaceId,
						referralCodeId: evaluated.referralCodeId,
						referrerClientRecordId: alice,
						referredClientRecordId: bob,
						orderId,
						rewardType: "fixed",
						rewardAmountCents: 1_000,
					}),
			),
		);
		/**
		 * 🔴 The invariant is ONE ROW, not one winner.
		 *
		 * This used to assert that exactly one call returned true, which encoded
		 * the old behaviour: the loser's order got no referral at all. If that
		 * order was the one the customer actually paid for, the referrer was never
		 * paid. The referral now moves to the most recent attempt, so whichever
		 * order settles carries the reward — and the unique index still guarantees
		 * a customer can only ever have one.
		 */
		expect(attempts.some(Boolean)).toBe(true);
		const sql = testDbClient();
		const rows = await sql`
			select id from referrals
			where workspace_id = ${workspaceId} and referred_client_record_id = ${bob}
		`;
		expect(rows).toHaveLength(1);
	});

	it("refuses when the programme is switched off", async () => {
		const { code } = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const r = await evaluateReferral({
			workspaceId,
			code,
			referredClientRecordId: bob,
			settings: { ...ON, enabled: false },
			orderSubtotalCents: 10_000,
		});
		expect(!r.ok && r.reason).toBe("DISABLED");
	});

	it("does not find another workspace's code", async () => {
		const { code } = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const r = await evaluateReferral({
			workspaceId: otherWorkspaceId,
			code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		expect(!r.ok && r.reason).toBe("NOT_FOUND");
	});
});

describe("a reward pays out only when the order is PAID", () => {
	async function referBobViaAlice() {
		const { code } = await issueReferralCode({
			workspaceId,
			clientRecordId: alice,
		});
		const e = await evaluateReferral({
			workspaceId,
			code,
			referredClientRecordId: bob,
			settings: ON,
			orderSubtotalCents: 10_000,
		});
		if (!e.ok) throw new Error("expected a valid referral");
		const orderId = await anOrder(bob);
		await recordReferral({
			workspaceId,
			referralCodeId: e.referralCodeId,
			referrerClientRecordId: alice,
			referredClientRecordId: bob,
			orderId,
			rewardType: e.rewardType,
			rewardAmountCents: e.rewardAmountCents,
		});
		return orderId;
	}

	it("counts nothing while the order is only placed", async () => {
		// 🔴 Crediting at checkout turns an abandoned payment into free money.
		await referBobViaAlice();
		const summary = await getReferralSummary({
			workspaceId,
			clientRecordId: alice,
		});
		expect(summary?.totalReferrals).toBe(0);
		expect(summary?.totalEarnedCents).toBe(0);
	});

	it("credits the referrer once the order settles", async () => {
		const orderId = await referBobViaAlice();
		expect(await completeReferralsForOrder({ workspaceId, orderId })).toBe(1);
		const summary = await getReferralSummary({
			workspaceId,
			clientRecordId: alice,
		});
		expect(summary?.totalReferrals).toBe(1);
		expect(summary?.totalEarnedCents).toBe(1_000);
	});

	it("does not pay twice when the settlement event is redelivered", async () => {
		const orderId = await referBobViaAlice();
		await completeReferralsForOrder({ workspaceId, orderId });
		// Providers deliver at least once. A second delivery must change nothing.
		expect(await completeReferralsForOrder({ workspaceId, orderId })).toBe(0);
		const summary = await getReferralSummary({
			workspaceId,
			clientRecordId: alice,
		});
		expect(summary?.totalEarnedCents).toBe(1_000);
	});

	it("reverses the credit when the order is cancelled", async () => {
		const orderId = await referBobViaAlice();
		await completeReferralsForOrder({ workspaceId, orderId });
		await cancelReferralsForOrder({ workspaceId, orderId });
		const summary = await getReferralSummary({
			workspaceId,
			clientRecordId: alice,
		});
		expect(summary?.totalReferrals).toBe(0);
		expect(summary?.totalEarnedCents).toBe(0);
	});

	it("cancelling something never credited changes no total", async () => {
		const orderId = await referBobViaAlice();
		await cancelReferralsForOrder({ workspaceId, orderId });
		const summary = await getReferralSummary({
			workspaceId,
			clientRecordId: alice,
		});
		expect(summary?.totalEarnedCents).toBe(0);
	});
});

describe("reward arithmetic", () => {
	it("pays a fixed amount regardless of order size", () => {
		expect(
			referralRewardCents({ rewardType: "fixed", rewardValue: 500 }, 1),
		).toBe(500);
	});

	it("computes a percentage in basis points, rounding down", () => {
		expect(
			referralRewardCents(
				{ rewardType: "percentage", rewardValue: 1_000 },
				1_999,
			),
		).toBe(199);
	});

	it("pays nothing when the reward is unset", () => {
		expect(
			referralRewardCents({ rewardType: "fixed", rewardValue: 0 }, 10_000),
		).toBe(0);
	});
});
