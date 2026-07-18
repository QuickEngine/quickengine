import { describe, expect, it } from "vitest";
import { can, capabilitiesFor } from "../src/rbac";

describe("workspace RBAC", () => {
	it("owner holds every capability", () => {
		expect(can("owner", "workspace.delete")).toBe(true);
		expect(can("owner", "billing.manage")).toBe(true);
		expect(can("owner", "members.manage")).toBe(true);
	});

	it("admin can manage but not delete or bill", () => {
		expect(can("admin", "members.manage")).toBe(true);
		expect(can("admin", "modules.manage")).toBe(true);
		expect(can("admin", "workspace.delete")).toBe(false);
		expect(can("admin", "billing.manage")).toBe(false);
	});

	it("member can operate but not manage", () => {
		expect(can("member", "records.write")).toBe(true);
		expect(can("member", "workspace.manage")).toBe(false);
		expect(can("member", "members.manage")).toBe(false);
	});

	it("every role can view the workspace", () => {
		for (const role of ["owner", "admin", "member"] as const) {
			expect(can(role, "workspace.view")).toBe(true);
		}
	});

	it("capabilitiesFor returns the role's bundle", () => {
		expect(capabilitiesFor("member")).toContain("records.write");
		expect(capabilitiesFor("member")).not.toContain("workspace.manage");
	});
});
