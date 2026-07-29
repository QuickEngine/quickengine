import { describe, expect, it } from "vitest";
import { credentialPresets } from "./credential-presets";

const capabilities = [
	"analytics:read",
	"catalog:read",
	"catalog:write",
	"events:write",
	"webhooks:read",
	"webhooks:write",
];

describe("credential purpose presets", () => {
	it("keeps public credentials browser-safe", () => {
		expect(
			credentialPresets["public-storefront"].selectCapabilities(capabilities),
		).toEqual(["catalog:read", "events:write"]);
	});

	it("makes reporting read-only", () => {
		expect(
			credentialPresets.reporting.selectCapabilities(capabilities),
		).toEqual(["analytics:read", "catalog:read", "webhooks:read"]);
	});

	it("limits webhook workers to webhook operations", () => {
		expect(
			credentialPresets["webhook-worker"].selectCapabilities(capabilities),
		).toEqual(["webhooks:read", "webhooks:write"]);
	});
});
