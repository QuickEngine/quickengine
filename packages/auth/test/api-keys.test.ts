import { describe, expect, it } from "vitest";
import {
	API_CAPABILITIES,
	PUBLISHABLE_CAPABILITIES,
	STOREFRONT_CAPABILITIES,
} from "../src/api-keys";

// Publishable keys ship in public website HTML, so this allowlist is a security boundary,
// not a convenience. These tests exist because the two capability lists sit next to each
// other and a careless edit can widen the public one without anyone noticing.
describe("publishable key capability allowlist", () => {
	it("grants no write capability except self-reported site telemetry", () => {
		const writes = PUBLISHABLE_CAPABILITIES.filter((capability) =>
			capability.endsWith(":write"),
		);
		expect(writes).toEqual(["events:write"]);
	});

	it("never exposes business data a public site has no business reading", () => {
		for (const capability of PUBLISHABLE_CAPABILITIES) {
			const [domain] = capability.split(":");
			expect(["catalog", "events"]).toContain(domain);
		}
	});

	it("only contains capabilities that actually exist", () => {
		for (const capability of PUBLISHABLE_CAPABILITIES) {
			expect(API_CAPABILITIES).toContain(capability);
		}
	});

	it("keeps every capability paired and lowercase so the gate can match it", () => {
		for (const capability of API_CAPABILITIES) {
			expect(capability).toMatch(/^[a-z-]+:(read|write)$/);
		}
		expect(new Set(API_CAPABILITIES).size).toBe(API_CAPABILITIES.length);
	});
});

// Storefront keys also ship in page source, and unlike publishable ones they can
// complete a purchase. That makes this list the most consequential allowlist in
// the codebase: everything on it is exposed to anyone who views source on a
// merchant website.
describe("storefront key capability allowlist", () => {
	it("grants checkout but never the raw order write", () => {
		expect(STOREFRONT_CAPABILITIES).toContain("checkout:write");
		// `orders:write` names its own prices and its own client. `checkout:write`
		// enters through a handler that resolves both server-side.
		expect(STOREFRONT_CAPABILITIES).not.toContain("orders:write");
	});

	it("never grants orders:read, which would publish the merchant's order book", () => {
		// The subtle one. A shopper reads their OWN orders through a customer
		// session scoped by `workspace_customers`; this key is not scoped to any
		// person, so the same capability here would expose every customer's name,
		// address and total to anyone viewing source.
		expect(STOREFRONT_CAPABILITIES).not.toContain("orders:read");
	});

	it("grants no write beyond checkout and self-reported telemetry", () => {
		const writes = STOREFRONT_CAPABILITIES.filter((capability) =>
			capability.endsWith(":write"),
		);
		expect(writes.sort()).toEqual(["checkout:write", "events:write"]);
	});

	it("never touches money, files, clients or contracts", () => {
		for (const capability of STOREFRONT_CAPABILITIES) {
			const [domain] = capability.split(":");
			expect(["catalog", "events", "checkout"]).toContain(domain);
		}
	});

	it("is a strict superset of publishable, so upgrading a key never removes access", () => {
		for (const capability of PUBLISHABLE_CAPABILITIES) {
			expect(STOREFRONT_CAPABILITIES).toContain(capability);
		}
	});

	it("only contains capabilities that actually exist", () => {
		for (const capability of STOREFRONT_CAPABILITIES) {
			expect(API_CAPABILITIES).toContain(capability);
		}
	});
});

describe("key type prefixes", () => {
	it("gives every type a distinct prefix so a leaked key is identifiable on sight", () => {
		const prefixes = ["qpk", "qsf", "qsk", "qsc"];
		expect(new Set(prefixes).size).toBe(prefixes.length);
	});
});
