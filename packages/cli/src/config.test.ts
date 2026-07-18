import { describe, expect, it } from "vitest";
import { credentialFromKey, maskKey, resolveConfig } from "./config";

describe("credentialFromKey", () => {
	it("maps prefixes to credential categories", () => {
		expect(credentialFromKey("qpk_abc")).toEqual({
			type: "publishable",
			key: "qpk_abc",
		});
		expect(credentialFromKey("qsk_abc")).toEqual({
			type: "secret",
			token: "qsk_abc",
		});
		expect(credentialFromKey("qsc_abc")).toEqual({
			type: "scoped",
			token: "qsc_abc",
		});
	});

	it("rejects an unknown format", () => {
		expect(() => credentialFromKey("nope")).toThrow("Unrecognized key format");
	});
});

describe("maskKey", () => {
	it("keeps the prefix and hides the rest", () => {
		expect(maskKey("qpk_supersecretvalue")).toBe("qpk_••••••••");
	});
});

describe("resolveConfig", () => {
	it("lets environment variables win over any on-disk file", () => {
		const resolved = resolveConfig({
			QUICK_BASE_URL: "https://dash.quickengine.test/api",
			QUICK_WORKSPACE: "ws_1",
			QUICK_KEY: "qpk_env",
		} as NodeJS.ProcessEnv);
		expect(resolved).toMatchObject({
			baseUrl: "https://dash.quickengine.test/api",
			workspaceId: "ws_1",
			key: "qpk_env",
		});
	});
});
