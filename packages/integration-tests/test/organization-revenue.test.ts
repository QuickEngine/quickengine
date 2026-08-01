import { getOrganizationRevenue } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "or-owner";
const orgId = "00000000-0000-4000-8000-0000000f0001";
const otherOrgId = "00000000-0000-4000-8000-0000000f0002";
const workspaceA = "00000000-0000-4000-8000-0000000f0011";
const workspaceB = "00000000-0000-4000-8000-0000000f0012";
const outsideWorkspace = "00000000-0000-4000-8000-0000000f0013";

const window = {
	from: new Date("2026-07-01T00:00:00Z"),
	to: new Date("2026-08-01T00:00:00Z"),
};

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'OR Owner', 'or@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, owner_id)
		values
			(${orgId}, 'Mine', 'mine', ${ownerId}),
			(${otherOrgId}, 'Theirs', 'theirs', ${ownerId})
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, organization_id, name, business_type)
		values
			(${workspaceA}, ${ownerId}, ${orgId}, 'Storefront', 'commerce'),
			(${workspaceB}, ${ownerId}, ${orgId}, 'Studio', 'service'),
			(${outsideWorkspace}, ${ownerId}, ${otherOrgId}, 'Not mine', 'commerce')
	`;
});

const payment = async (
	workspaceId: string,
	amountCents: number,
	currency: string,
	succeededAt: string,
	refundedAt?: string,
) => {
	const sql = testDbClient();
	await sql`
		insert into payments (workspace_id, amount_cents, currency, status, succeeded_at, refunded_at)
		values (
			${workspaceId}, ${amountCents}, ${currency},
			${refundedAt ? "refunded" : "succeeded"},
			${succeededAt}, ${refundedAt ?? null}
		)
	`;
};

describe("organization revenue", () => {
	it("rolls every workspace in the organization into one answer", async () => {
		await payment(workspaceA, 10_000, "USD", "2026-07-10T12:00:00Z");
		await payment(workspaceB, 5_000, "USD", "2026-07-11T12:00:00Z");

		const revenue = await getOrganizationRevenue(orgId, window);

		expect(revenue.totals).toHaveLength(1);
		expect(revenue.totals[0]?.currency).toBe("USD");
		expect(revenue.totals[0]?.collectedCents).toBe(15_000);
		expect(revenue.totals[0]?.netCents).toBe(15_000);
		expect(revenue.workspaces).toHaveLength(2);
	});

	// 🔴 The guarantee. Another organization's takings must never appear here.
	it("never includes a workspace belonging to another organization", async () => {
		await payment(workspaceA, 10_000, "USD", "2026-07-10T12:00:00Z");
		await payment(outsideWorkspace, 99_000, "USD", "2026-07-10T12:00:00Z");

		const revenue = await getOrganizationRevenue(orgId, window);

		expect(revenue.totals[0]?.collectedCents).toBe(10_000);
		expect(
			revenue.workspaces.some((row) => row.workspaceId === outsideWorkspace),
		).toBe(false);
	});

	// Adding 100 USD to 100 EUR gives 200 of nothing.
	it("keeps currencies apart instead of summing them", async () => {
		await payment(workspaceA, 10_000, "USD", "2026-07-10T12:00:00Z");
		await payment(workspaceA, 8_000, "EUR", "2026-07-10T12:00:00Z");

		const revenue = await getOrganizationRevenue(orgId, window);

		expect(revenue.totals).toHaveLength(2);
		expect(revenue.totals.map((row) => row.currency)).toEqual(["EUR", "USD"]);
	});

	// A refund belongs to the period it was refunded in, or it silently rewrites
	// a month that was already closed and reported.
	it("counts a refund when it happened, not when the payment did", async () => {
		await payment(
			workspaceA,
			10_000,
			"USD",
			"2026-06-15T12:00:00Z",
			"2026-07-15T12:00:00Z",
		);

		const revenue = await getOrganizationRevenue(orgId, window);

		// The payment succeeded in June, so nothing was collected in July.
		expect(revenue.totals[0]?.collectedCents).toBe(0);
		expect(revenue.totals[0]?.refundedCents).toBe(10_000);
		expect(revenue.totals[0]?.netCents).toBe(-10_000);
	});

	it("returns an empty answer for an organization with no workspaces", async () => {
		const sql = testDbClient();
		const emptyOrg = "00000000-0000-4000-8000-0000000f0099";
		await sql`
			insert into quickengine_organizations (id, name, slug, owner_id)
			values (${emptyOrg}, 'Empty', 'empty', ${ownerId})
		`;

		const revenue = await getOrganizationRevenue(emptyOrg, window);

		expect(revenue.totals).toEqual([]);
		expect(revenue.workspaces).toEqual([]);
	});
});
