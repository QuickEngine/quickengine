import { describe, expect, it } from "vitest";
import { API_CAPABILITIES, PUBLISHABLE_CAPABILITIES } from "../src/api-keys";

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
