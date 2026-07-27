import { describe, expect, it } from "vitest";
import {
	canGrantCapabilities,
	holds,
	isBuiltInRole,
	resolveCapabilities,
} from "../src/rbac";

const custom = new Map<string, readonly string[]>([
	["bookkeeper", ["workspace.view", "records.write"]],
	["fucker", ["workspace.view", "apikeys.manage"]],
]);

describe("custom roles", () => {
	// The name is a free-text label. Only the capability list means anything.
	it("resolves a custom role by whatever it was named", () => {
		expect(resolveCapabilities("Bookkeeper", custom)).toEqual([
			"workspace.view",
			"records.write",
		]);
		expect(resolveCapabilities("Fucker", custom)).toEqual([
			"workspace.view",
			"apikeys.manage",
		]);
	});

	/**
	 * A custom role named "owner" must not redefine owner, or an organization could
	 * strip its own billing access and lock itself out of its account.
	 */
	it("never lets a custom role shadow a built-in", () => {
		const hostile = new Map([["owner", ["workspace.view"]]]);
		expect(resolveCapabilities("owner", hostile)).toContain("billing.manage");
	});

	/**
	 * Fails closed. Inheriting a default would keep granting access after an
	 * administrator deleted the role precisely to revoke it.
	 */
	it("grants nothing for a role that no longer exists", () => {
		expect(resolveCapabilities("deleted-role", custom)).toEqual([]);
	});

	// A capability removed from the product must stop granting, even while stale
	// rows still name it.
	it("ignores capabilities that are no longer real", () => {
		const stale = new Map([["legacy", ["workspace.view", "nukes.launch"]]]);
		expect(resolveCapabilities("legacy", stale)).toEqual(["workspace.view"]);
	});

	it("matches role names case-insensitively", () => {
		expect(resolveCapabilities("BOOKKEEPER", custom)).toHaveLength(2);
	});

	it("knows which names are built in", () => {
		expect(isBuiltInRole("admin")).toBe(true);
		expect(isBuiltInRole("Bookkeeper")).toBe(false);
	});
});

describe("privilege escalation guard", () => {
	/**
	 * The classic custom-roles hole: an admin mints a role carrying a capability
	 * they lack, assigns it to themselves, and escalates.
	 */
	it("refuses to let an admin grant billing they do not hold", () => {
		expect(canGrantCapabilities("admin", ["billing.manage"])).toBe(false);
		expect(canGrantCapabilities("owner", ["billing.manage"])).toBe(true);
	});

	it("allows granting capabilities the granter holds", () => {
		expect(canGrantCapabilities("admin", ["records.write"])).toBe(true);
	});

	it("refuses the whole set if any single capability is out of reach", () => {
		expect(
			canGrantCapabilities("admin", ["records.write", "workspace.delete"]),
		).toBe(false);
	});

	it("lets a member grant nothing beyond their own", () => {
		expect(canGrantCapabilities("member", ["members.manage"])).toBe(false);
	});
});

describe("holds", () => {
	it("grants when the capability is present", () => {
		expect(
			holds(
				{ capabilities: ["records.write", "workspace.view"] },
				"records.write",
			),
		).toBe(true);
	});

	it("denies when it is absent, and for no access at all", () => {
		expect(holds({ capabilities: ["workspace.view"] }, "billing.manage")).toBe(
			false,
		);
		expect(holds(null, "workspace.view")).toBe(false);
		expect(holds(undefined, "workspace.view")).toBe(false);
	});
});
