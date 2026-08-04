import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createDiscount,
	evaluateDiscount,
	redeemDiscount,
	updateDiscount,
} from "../src";

const ownerId = "discount-owner";
const workspaceId = "00000000-0000-4000-8000-0000000009e1";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000009e2";
const clientId = "00000000-0000-4000-8000-0000000009e3";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'D Owner', 'd@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Gems', 'custom'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'custom')`;
	await sql`insert into client_records (id, workspace_id, name, email) values (${clientId}, ${workspaceId}, 'Buyer', 'buyer@example.com')`;
});

async function anOrder() {
	const sql = testDbClient();
	const id = crypto.randomUUID();
	await sql`
		insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, tax_cents, total_cents, status)
		values (${id}, ${workspaceId}, ${clientId}, 'Buyer', ${Math.floor(Math.random() * 1_000_000)}, ${`ORD-${id.slice(0, 8)}`}, 'USD', 10000, 0, 10000, 'draft')
	`;
	return id;
}

describe("a code belongs to one workspace", () => {
	it("lets two shops run the same code independently", async () => {
		await createDiscount(workspaceId, {
			name: "Summer",
			code: "SUMMER10",
			valueType: "percentage",
			value: 1_000,
		});
		await expect(
			createDiscount(otherWorkspaceId, {
				name: "Summer",
				code: "SUMMER10",
				valueType: "percentage",
				value: 2_000,
			}),
		).resolves.toBeTruthy();

		// And each sees only its own value.
		const ours = await evaluateDiscount({
			workspaceId,
			code: "SUMMER10",
			subtotalCents: 10_000,
		});
		expect(ours.ok && ours.amountCents).toBe(1_000);
	});

	it("does not find another shop's code", async () => {
		await createDiscount(otherWorkspaceId, {
			name: "Theirs",
			code: "THEIRS",
			valueType: "fixed",
			value: 500,
		});
		const result = await evaluateDiscount({
			workspaceId,
			code: "THEIRS",
			subtotalCents: 10_000,
		});
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("NOT_FOUND");
	});
});

describe("codes are case-insensitive", () => {
	it("matches however the shopper typed it", async () => {
		await createDiscount(workspaceId, {
			name: "Summer",
			code: "summer10",
			valueType: "fixed",
			value: 500,
		});
		for (const typed of ["SUMMER10", "summer10", "Summer10", "  summer10  "]) {
			const r = await evaluateDiscount({
				workspaceId,
				code: typed,
				subtotalCents: 10_000,
			});
			expect(r.ok, typed).toBe(true);
		}
	});
});

describe("why a code is refused", () => {
	async function code(overrides: Record<string, unknown> = {}) {
		return createDiscount(workspaceId, {
			name: "Test",
			code: `C${crypto.randomUUID().slice(0, 8)}`,
			valueType: "fixed",
			value: 500,
			...overrides,
		});
	}

	it("refuses an inactive code", async () => {
		const d = await code({ active: false });
		const r = await evaluateDiscount({
			workspaceId,
			code: d.code,
			subtotalCents: 10_000,
		});
		expect(!r.ok && r.reason).toBe("INACTIVE");
	});

	it("refuses one that has not started", async () => {
		const d = await code({ startsAt: new Date(Date.now() + 86_400_000) });
		const r = await evaluateDiscount({
			workspaceId,
			code: d.code,
			subtotalCents: 10_000,
		});
		expect(!r.ok && r.reason).toBe("NOT_STARTED");
	});

	it("refuses an expired one", async () => {
		const d = await code({ endsAt: new Date(Date.now() - 1_000) });
		const r = await evaluateDiscount({
			workspaceId,
			code: d.code,
			subtotalCents: 10_000,
		});
		expect(!r.ok && r.reason).toBe("EXPIRED");
	});

	it("refuses below the minimum spend", async () => {
		const d = await code({ minimumSubtotalCents: 5_000 });
		const r = await evaluateDiscount({
			workspaceId,
			code: d.code,
			subtotalCents: 4_999,
		});
		expect(!r.ok && r.reason).toBe("BELOW_MINIMUM");
		// And accepts it exactly at the threshold.
		const at = await evaluateDiscount({
			workspaceId,
			code: d.code,
			subtotalCents: 5_000,
		});
		expect(at.ok).toBe(true);
	});

	it("rejects a window that ends before it starts", async () => {
		await expect(
			code({
				startsAt: new Date(Date.now() + 86_400_000),
				endsAt: new Date(Date.now() + 1_000),
			}),
		).rejects.toThrow("DISCOUNT_WINDOW_INVALID");
	});
});

describe("redemption caps", () => {
	it("cannot be spent more times than its limit", async () => {
		// 🔴 The conditional UPDATE is what makes this safe. A read-then-write
		// would let two shoppers both spend the last use.
		const d = await createDiscount(workspaceId, {
			name: "Limited",
			code: "LIMITED",
			valueType: "fixed",
			value: 500,
			maxRedemptions: 2,
		});

		const spend = () =>
			redeemDiscount({
				workspaceId,
				discountId: d.id,
				clientRecordId: clientId,
				orderId: null as unknown as string,
				amountCents: 500,
			});

		expect(
			await redeemDiscount({
				workspaceId,
				discountId: d.id,
				clientRecordId: clientId,
				orderId: await anOrder(),
				amountCents: 500,
			}),
		).toBe(true);
		expect(
			await redeemDiscount({
				workspaceId,
				discountId: d.id,
				clientRecordId: clientId,
				orderId: await anOrder(),
				amountCents: 500,
			}),
		).toBe(true);
		// Third is refused by the database, not by a check we remembered to write.
		expect(
			await redeemDiscount({
				workspaceId,
				discountId: d.id,
				clientRecordId: clientId,
				orderId: await anOrder(),
				amountCents: 500,
			}),
		).toBe(false);

		const after = await evaluateDiscount({
			workspaceId,
			code: "LIMITED",
			subtotalCents: 10_000,
		});
		expect(!after.ok && after.reason).toBe("FULLY_REDEEMED");
		void spend;
	});

	it("survives concurrent attempts on the last use", async () => {
		const d = await createDiscount(workspaceId, {
			name: "One",
			code: "ONLYONE",
			valueType: "fixed",
			value: 500,
			maxRedemptions: 1,
		});
		const orders = [await anOrder(), await anOrder(), await anOrder()];
		const results = await Promise.all(
			orders.map((orderId) =>
				redeemDiscount({
					workspaceId,
					discountId: d.id,
					clientRecordId: clientId,
					orderId,
					amountCents: 500,
				}),
			),
		);
		// Exactly one wins. Without the conditional update, all three would.
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it("enforces a per-customer cap", async () => {
		const d = await createDiscount(workspaceId, {
			name: "Once each",
			code: "ONCEEACH",
			valueType: "fixed",
			value: 500,
			maxRedemptionsPerCustomer: 1,
		});
		await redeemDiscount({
			workspaceId,
			discountId: d.id,
			clientRecordId: clientId,
			orderId: await anOrder(),
			amountCents: 500,
		});
		const r = await evaluateDiscount({
			workspaceId,
			code: "ONCEEACH",
			subtotalCents: 10_000,
			clientRecordId: clientId,
		});
		expect(!r.ok && r.reason).toBe("CUSTOMER_LIMIT_REACHED");
	});

	it("does not apply the per-customer cap to an anonymous preview", async () => {
		// A storefront previewing a code before sign-in has no client record. The
		// cap is re-checked at redemption, which is the point that matters.
		const d = await createDiscount(workspaceId, {
			name: "Once each",
			code: "ANON",
			valueType: "fixed",
			value: 500,
			maxRedemptionsPerCustomer: 1,
		});
		await redeemDiscount({
			workspaceId,
			discountId: d.id,
			clientRecordId: clientId,
			orderId: await anOrder(),
			amountCents: 500,
		});
		const r = await evaluateDiscount({
			workspaceId,
			code: "ANON",
			subtotalCents: 10_000,
		});
		expect(r.ok).toBe(true);
	});
});

describe("deactivating", () => {
	it("stops a code without deleting what it cost", async () => {
		const d = await createDiscount(workspaceId, {
			name: "Season",
			code: "SEASON",
			valueType: "fixed",
			value: 500,
		});
		await redeemDiscount({
			workspaceId,
			discountId: d.id,
			clientRecordId: clientId,
			orderId: await anOrder(),
			amountCents: 500,
		});
		await updateDiscount(workspaceId, d.id, { active: false });

		const sql = testDbClient();
		const [row] =
			await sql`select count(*)::int as n from discount_redemptions where discount_id = ${d.id}`;
		expect(row.n).toBe(1);
	});
});
