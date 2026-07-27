import {
	creditBalanceMicros,
	expireCredits,
	getAutoRecharge,
	recordCreditEntry,
	recordTopUp,
	setAutoRecharge,
	workspaceSpendMicros,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "cr-owner";
const orgId = "00000000-0000-4000-8000-0000000c0001";
const workspaceId = "00000000-0000-4000-8000-0000000c0010";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000c0011";

const DOLLAR = 1_000_000;
const EPOCH = new Date("2020-01-01T00:00:00.000Z");

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Credit Owner', 'credits@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, is_personal, owner_id)
		values (${orgId}, 'Credit Org', 'credit-org', false, ${ownerId})
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, organization_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, ${orgId}, 'Credit WS', 'ecommerce'),
			(${otherWorkspaceId}, ${ownerId}, ${orgId}, 'Other WS', 'ecommerce')
	`;
});

describe("credit balance", () => {
	it("is the sum of every movement, with nothing hidden", async () => {
		expect(await creditBalanceMicros(orgId)).toBe(0);

		await recordTopUp({
			organizationId: orgId,
			amountMicros: 20 * DOLLAR,
			stripePaymentIntentId: "pi_balance_1",
		});
		await recordCreditEntry({
			organizationId: orgId,
			workspaceId,
			kind: "spend",
			amountMicros: -3 * DOLLAR,
		});

		expect(await creditBalanceMicros(orgId)).toBe(17 * DOLLAR);
	});

	it("keeps sub-cent amounts exact", async () => {
		// One AI action is roughly three tenths of a cent. Integer cents cannot
		// represent it at all, so a thousand of them is the case that would expose
		// any rounding: it must land on exactly $3, not near it.
		await recordTopUp({
			organizationId: orgId,
			amountMicros: 10 * DOLLAR,
			stripePaymentIntentId: "pi_precision",
		});
		// One statement rather than a thousand round-trips: the arithmetic is what
		// is under test, and a serial loop only added a timeout to race under load.
		const sql = testDbClient();
		await sql`
			insert into quickengine_credit_entries
				(organization_id, workspace_id, kind, amount_micros)
			select ${orgId}::uuid, ${workspaceId}::uuid, 'spend', -3000
			from generate_series(1, 1000)
		`;
		expect(await creditBalanceMicros(orgId)).toBe(7 * DOLLAR);
	});

	it("keeps organizations separate", async () => {
		const sql = testDbClient();
		const otherOrg = "00000000-0000-4000-8000-0000000c0002";
		await sql`
			insert into quickengine_organizations (id, name, slug, is_personal, owner_id)
			values (${otherOrg}, 'Other', 'other-credit-org', false, ${ownerId})
		`;
		await recordTopUp({
			organizationId: orgId,
			amountMicros: 5 * DOLLAR,
			stripePaymentIntentId: "pi_scope",
		});

		expect(await creditBalanceMicros(otherOrg)).toBe(0);
	});
});

describe("top-ups", () => {
	it("credits a repeated Stripe webhook exactly once", async () => {
		// Stripe retries on any non-2xx, on timeouts, and sometimes for no visible
		// reason. Without this the customer gets free credit every time it happens.
		const first = await recordTopUp({
			organizationId: orgId,
			amountMicros: 50 * DOLLAR,
			stripePaymentIntentId: "pi_retry",
		});
		const replay = await recordTopUp({
			organizationId: orgId,
			amountMicros: 50 * DOLLAR,
			stripePaymentIntentId: "pi_retry",
		});

		expect(await creditBalanceMicros(orgId)).toBe(50 * DOLLAR);
		// The replay is indistinguishable to the caller — same row, no error.
		expect(replay?.id).toBe(first?.id);
	});
});

describe("workspace spend", () => {
	it("counts only what this workspace spent", async () => {
		await recordCreditEntry({
			organizationId: orgId,
			workspaceId,
			kind: "spend",
			amountMicros: -4 * DOLLAR,
		});
		await recordCreditEntry({
			organizationId: orgId,
			workspaceId: otherWorkspaceId,
			kind: "spend",
			amountMicros: -9 * DOLLAR,
		});

		expect(await workspaceSpendMicros(workspaceId, EPOCH)).toBe(4 * DOLLAR);
		expect(await workspaceSpendMicros(otherWorkspaceId, EPOCH)).toBe(
			9 * DOLLAR,
		);
	});

	it("does not let a refund buy back headroom under the cap", async () => {
		// The cap bounds how fast one workspace can burn the account's money. If a
		// refund reduced measured spend, a workspace could cycle spend and refunds
		// and run past the ceiling indefinitely.
		await recordCreditEntry({
			organizationId: orgId,
			workspaceId,
			kind: "spend",
			amountMicros: -10 * DOLLAR,
		});
		await recordCreditEntry({
			organizationId: orgId,
			workspaceId,
			kind: "refund",
			amountMicros: 10 * DOLLAR,
		});

		expect(await workspaceSpendMicros(workspaceId, EPOCH)).toBe(10 * DOLLAR);
		// The refund still restores the balance — it just does not reset the cap.
		expect(await creditBalanceMicros(orgId)).toBe(0);
	});

	it("only counts spend inside the window", async () => {
		await recordCreditEntry({
			organizationId: orgId,
			workspaceId,
			kind: "spend",
			amountMicros: -6 * DOLLAR,
		});
		const future = new Date(Date.now() + 60_000);

		expect(await workspaceSpendMicros(workspaceId, future)).toBe(0);
	});
});

describe("expiry", () => {
	it("cancels expired credit with an offsetting row rather than hiding it", async () => {
		const sql = testDbClient();
		await recordTopUp({
			organizationId: orgId,
			amountMicros: 8 * DOLLAR,
			stripePaymentIntentId: "pi_expiring",
			expiresAt: new Date("2020-06-01T00:00:00.000Z"),
		});
		expect(await creditBalanceMicros(orgId)).toBe(8 * DOLLAR);

		expect(await expireCredits(new Date("2020-07-01T00:00:00.000Z"))).toBe(1);
		expect(await creditBalanceMicros(orgId)).toBe(0);

		// The original top-up is still there. A statement must show what was lost,
		// which a filtered balance query could never do.
		const rows = await sql`
			select kind, amount_micros from quickengine_credit_entries
			where organization_id = ${orgId} order by kind
		`;
		expect(rows.map((r) => r.kind)).toEqual(["expiry", "topup"]);
	});

	it("never expires the same credit twice", async () => {
		await recordTopUp({
			organizationId: orgId,
			amountMicros: 8 * DOLLAR,
			stripePaymentIntentId: "pi_expire_once",
			expiresAt: new Date("2020-06-01T00:00:00.000Z"),
		});
		const when = new Date("2020-07-01T00:00:00.000Z");

		expect(await expireCredits(when)).toBe(1);
		expect(await expireCredits(when)).toBe(0);
		expect(await creditBalanceMicros(orgId)).toBe(0);
	});

	it("leaves credit that has not expired alone", async () => {
		await recordTopUp({
			organizationId: orgId,
			amountMicros: 8 * DOLLAR,
			stripePaymentIntentId: "pi_not_yet",
			expiresAt: new Date("2030-01-01T00:00:00.000Z"),
		});

		expect(await expireCredits(new Date("2026-01-01T00:00:00.000Z"))).toBe(0);
		expect(await creditBalanceMicros(orgId)).toBe(8 * DOLLAR);
	});

	it("leaves credit with no expiry date alone forever", async () => {
		await recordTopUp({
			organizationId: orgId,
			amountMicros: 8 * DOLLAR,
			stripePaymentIntentId: "pi_never",
		});

		expect(await expireCredits(new Date("2099-01-01T00:00:00.000Z"))).toBe(0);
		expect(await creditBalanceMicros(orgId)).toBe(8 * DOLLAR);
	});
});

describe("auto-recharge settings", () => {
	it("is off until someone explicitly turns it on", async () => {
		// A standing authorisation to charge a card must never be the default.
		expect(await getAutoRecharge(orgId)).toBeNull();
	});

	it("stores a threshold and amount once enabled", async () => {
		await setAutoRecharge({
			organizationId: orgId,
			enabled: true,
			thresholdMicros: 2 * DOLLAR,
			amountCents: 2_500,
			stripePaymentMethodId: "pm_test",
		});

		const settings = await getAutoRecharge(orgId);
		expect(settings?.enabled).toBe(true);
		expect(settings?.thresholdMicros).toBe(2 * DOLLAR);
		expect(settings?.amountCents).toBe(2_500);
	});

	it("can be turned off without losing the card on file", async () => {
		await setAutoRecharge({
			organizationId: orgId,
			enabled: true,
			thresholdMicros: 2 * DOLLAR,
			amountCents: 2_500,
			stripePaymentMethodId: "pm_keep",
		});
		await setAutoRecharge({
			organizationId: orgId,
			enabled: false,
			thresholdMicros: 2 * DOLLAR,
			amountCents: 2_500,
			stripePaymentMethodId: "pm_keep",
		});

		const settings = await getAutoRecharge(orgId);
		expect(settings?.enabled).toBe(false);
		// Turning it off is not the same as forgetting the card — re-enabling should
		// not force the customer to enter it again.
		expect(settings?.stripePaymentMethodId).toBe("pm_keep");
	});

	it("records why it disabled itself after a failed charge", async () => {
		// The customer has to be told what happened, and a silent disable is how
		// somebody discovers their AI stopped working a week later.
		await setAutoRecharge({
			organizationId: orgId,
			enabled: false,
			thresholdMicros: 2 * DOLLAR,
			amountCents: 2_500,
			stripePaymentMethodId: "pm_dead",
			lastFailureAt: new Date("2026-07-27T00:00:00.000Z"),
			lastFailureReason: "Your card was declined.",
		});

		const settings = await getAutoRecharge(orgId);
		expect(settings?.enabled).toBe(false);
		expect(settings?.lastFailureReason).toBe("Your card was declined.");
		expect(settings?.lastFailureAt).toBeInstanceOf(Date);
	});
});
