import { describe, expect, it } from "vitest";
import {
	normalizeBusinessType,
	normalizeWorkspaceName,
} from "./workspace-input";

describe("workspace input normalization", () => {
	it("trims a valid workspace name", () => {
		expect(normalizeWorkspaceName("  Acme Printing  ")).toBe("Acme Printing");
	});

	it("rejects an empty or excessively long name", () => {
		expect(() => normalizeWorkspaceName("   ")).toThrow(
			"WORKSPACE_NAME_REQUIRED",
		);
		expect(() => normalizeWorkspaceName("x".repeat(121))).toThrow(
			"WORKSPACE_NAME_TOO_LONG",
		);
	});

	it("normalizes a stable business-type id", () => {
		expect(normalizeBusinessType("  Print-Shop ")).toBe("print-shop");
	});

	it("rejects an unsafe business-type id", () => {
		expect(() => normalizeBusinessType("print shop!")).toThrow(
			"WORKSPACE_BUSINESS_TYPE_INVALID",
		);
	});
});
