import { testDbClient } from "@quickengine/db/testing";
import { createOrderCommand } from "@quickengine/mod-orders";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * A discount and the order that spends it commit together, or not at all.
 *
 * 🔴 They used not to. `redeemDiscount` ran AFTER `createOrderCommand` returned,
 * because that command owned its transaction and could not accept extra work.
 * The window: an order could exist carrying a discount whose redemption row was
 * never written, so a code with `max_redemptions = 1` could be spent twice.
 *
 * The second test below is the one that matters — it asserts no orphan order is
 * left behind when the cap loses its race.
 */

const ownerId = "disc-owner";
// Hex only — DB_RULES rule 2.
const workspaceId = "00000000-0000-4000-8000-0000000e0001";
const clientId = "00000000-0000-4000-8000-0000000e0002";
const discountId = "00000000-0000-4000-8000-0000000e0003";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Disc Owner', 'disc@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Disc Workspace', 'ecommerce')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
	// A code good for exactly ONE redemption. The whole point of the race.
	await sql`
		insert into discounts (id, workspace_id, name, code, value_type, value, max_redemptions, active)
		values (${discountId}, ${workspaceId}, 'One shot', 'ONESHOT', 'percentage', 1000, 1, true)
	`;
});

const context = (key: string) => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint: key,
	idempotencyKey: key,
	operation: "checkout.create",
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const orderInput = {
	clientId,
	currency: "USD",
	discountCents: 1_000,
	discountCode: "ONESHOT",
	lines: [
		{
			name: "Amethyst",
			type: "physical" as const,
			quantity: 1,
			unitPriceCents: 10_000,
		},
	],
	metadata: {},
};

const redemption = {
	discountId,
	clientRecordId: clientId,
	amountCents: 1_000,
};

const countOrders = async () => {
	const sql = testDbClient();
	const rows = await sql`
		select count(*)::int as n from orders where workspace_id = ${workspaceId}
	`;
	return rows[0].n as number;
};

describe("a discount and its order commit together", () => {
	it("records the redemption in the same transaction as the order", async () => {
		const sql = testDbClient();
		const outcome = await createOrderCommand(
			context("first"),
			orderInput,
			undefined,
			redemption,
		);
		expect(outcome.kind).toBe("success");
		if (outcome.kind !== "success") throw new Error("unreachable");

		const [discount] = await sql`
			select times_redeemed from discounts where id = ${discountId}
		`;
		expect(discount.times_redeemed).toBe(1);

		const redemptions = await sql`
			select order_id, amount_cents from discount_redemptions
			where discount_id = ${discountId}
		`;
		expect(redemptions).toHaveLength(1);
		expect(redemptions[0].order_id).toBe(outcome.result.id);
		expect(redemptions[0].amount_cents).toBe(1_000);
	});

	it("🔴 rolls the ORDER back when the cap is already spent", async () => {
		// Burn the single redemption.
		const first = await createOrderCommand(
			context("first"),
			orderInput,
			undefined,
			redemption,
		);
		expect(first.kind).toBe("success");
		expect(await countOrders()).toBe(1);

		// The second attempt must not leave an order behind. Before the fix it
		// committed the order and merely logged that the discount was exhausted,
		// so the shop gave away a discount its own cap said was gone.
		await expect(
			createOrderCommand(context("second"), orderInput, undefined, redemption),
		).rejects.toThrow(/used up/i);

		expect(await countOrders()).toBe(1);

		const sql = testDbClient();
		const [discount] = await sql`
			select times_redeemed from discounts where id = ${discountId}
		`;
		// Still one. The failed attempt neither counted nor over-counted.
		expect(discount.times_redeemed).toBe(1);

		const redemptions = await sql`
			select id from discount_redemptions where discount_id = ${discountId}
		`;
		expect(redemptions).toHaveLength(1);
	});

	it("writes no redemption row when no discount was applied", async () => {
		const outcome = await createOrderCommand(context("plain"), {
			...orderInput,
			discountCents: 0,
			discountCode: null,
		});
		expect(outcome.kind).toBe("success");

		const sql = testDbClient();
		const redemptions = await sql`
			select id from discount_redemptions where workspace_id = ${workspaceId}
		`;
		expect(redemptions).toHaveLength(0);
	});
});
