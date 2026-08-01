import {
	attributionFrom,
	getActivationRate,
	getFunnel,
	getRetention,
	recordProductEvent,
	stripUnsafe,
} from "@quickengine/analytics";
import { testDbClient } from "@quickengine/db/testing";
import { describe, expect, it } from "vitest";

const window = {
	from: new Date(Date.now() - 60 * 60 * 1000),
	to: new Date(Date.now() + 60 * 60 * 1000),
};

describe("product analytics", () => {
	it("counts distinct people through a funnel, not events", async () => {
		// One person signing up three times is one signup. A funnel built on event
		// counts makes the broken step look like the popular one.
		for (let i = 0; i < 3; i++) {
			await recordProductEvent({
				name: "signup.completed",
				surface: "auth",
				userId: "pa-user-1",
			});
		}
		await recordProductEvent({
			name: "signup.completed",
			surface: "auth",
			userId: "pa-user-2",
		});
		await recordProductEvent({
			name: "activation.first_outcome",
			surface: "quickdash",
			userId: "pa-user-1",
		});

		const funnel = await getFunnel(
			["signup.completed", "activation.first_outcome"],
			window,
		);

		expect(funnel[0]?.people).toBe(2);
		expect(funnel[1]?.people).toBe(1);
		expect(funnel[1]?.conversionFromStart).toBe(50);
	});

	it("reports the activation rate", async () => {
		await recordProductEvent({
			name: "signup.completed",
			surface: "auth",
			userId: "pa-rate-1",
		});
		await recordProductEvent({
			name: "signup.completed",
			surface: "auth",
			userId: "pa-rate-2",
		});
		await recordProductEvent({
			name: "activation.first_outcome",
			surface: "quickdash",
			userId: "pa-rate-1",
		});

		const rate = await getActivationRate(window);
		expect(rate.signups).toBe(2);
		expect(rate.activated).toBe(1);
		expect(rate.rate).toBe(50);
	});

	// 🔴 The safety net. `properties` is open by design so a new dimension needs
	// no migration, and the cost of that is somebody eventually passing content.
	it("drops properties that carry content rather than dimensions", () => {
		const { safe, dropped } = stripUnsafe({
			moduleId: "invoicing",
			clientName: "Ada Lovelace",
			customerEmail: "ada@example.com",
			searchQuery: "unpaid invoices",
			apiKey: "qe_live_secret",
			pageUrl: "https://example.com/invoices/1",
			count: 3,
		});

		expect(safe).toEqual({ moduleId: "invoicing", count: 3 });
		expect(dropped.sort()).toEqual([
			"apiKey",
			"clientName",
			"customerEmail",
			"pageUrl",
			"searchQuery",
		]);
	});

	// No legitimate dimension is a paragraph.
	it("drops a long string even under an innocent key", () => {
		const { safe, dropped } = stripUnsafe({ note2: "x".repeat(200) });
		expect(safe).toEqual({});
		expect(dropped).toEqual(["note2"]);
	});

	it("stores only what survived the filter", async () => {
		await recordProductEvent({
			name: "command.failed",
			surface: "quickdash",
			userId: "pa-strip",
			properties: { moduleId: "orders", searchQuery: "secret thing" },
		});

		const sql = testDbClient();
		const [row] = await sql`
			select properties from product_events
			where user_id = 'pa-strip' order by occurred_at desc limit 1`;
		expect(row?.properties).toEqual({ moduleId: "orders" });
	});

	// Telemetry that can fail a request turns a reporting outage into a product
	// outage, and then somebody rips the instrumentation out rather than debug it.
	it("never throws, even on a bad write", async () => {
		await expect(
			recordProductEvent({
				name: "workspace.created",
				surface: "account",
				// Not a uuid. The insert will fail; the caller must not.
				workspaceId: "not-a-uuid",
			}),
		).resolves.toBeUndefined();
	});
});

describe("retention", () => {
	it("counts a return on or after the day, not exactly on it", async () => {
		const sql = testDbClient();
		const user = "pa-retained";
		const signup = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
		// Came back on day 9. Requiring the exact day would report this person as
		// churned at day 7, which is how a healthy product looks dead.
		const returned = new Date(signup.getTime() + 9 * 24 * 60 * 60 * 1000);

		await sql`
			insert into product_events (name, user_id, surface, occurred_at)
			values
				('signup.completed', ${user}, 'auth', ${signup}),
				('module.configured', ${user}, 'account', ${returned})
		`;

		const retention = await getRetention({
			from: new Date(signup.getTime() - 1000),
			to: new Date(signup.getTime() + 1000),
		});

		expect(retention.cohortSize).toBe(1);
		expect(retention.day1).toBe(1);
		expect(retention.day7).toBe(1);
		// Day 30 has not been reached, so it must not be counted.
		expect(retention.day30).toBe(0);
	});
});

describe("campaign attribution", () => {
	it("keeps the four dimensions and drops everything else", () => {
		expect(
			attributionFrom({
				utm_source: "twitter",
				utm_medium: "cpc",
				utm_campaign: "launch-week",
				referrerHost: "news.ycombinator.com",
				// Not allowlisted: these routinely carry ad copy and free text.
				utm_content: "headline variant B, the long one about invoicing",
				utm_term: "best invoicing software for plumbers",
				landingUrl: "https://quickdash.xyz/signup?ref=secret",
			}),
		).toEqual({
			utm_source: "twitter",
			utm_medium: "cpc",
			utm_campaign: "launch-week",
			referrerHost: "news.ycombinator.com",
		});
	});

	// Truncated, not rejected — losing the whole attribution because one field
	// was abused would lose the signal entirely.
	it("truncates an overlong campaign rather than dropping it", () => {
		const result = attributionFrom({ utm_campaign: "x".repeat(500) });
		expect(result.utm_campaign).toHaveLength(80);
	});

	it("ignores non-string values", () => {
		expect(attributionFrom({ utm_source: 42, utm_medium: null })).toEqual({});
	});
});
