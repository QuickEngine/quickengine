import { describe, expect, it } from "vitest";
import { ACCOUNT_NAV_ITEMS } from "./nav-items";

describe("Account navigation", () => {
	it("contains only operational surfaces backed by real account data", () => {
		expect(
			ACCOUNT_NAV_ITEMS.map(({ href, label }) => ({ href, label })),
		).toEqual([
			{ href: "/", label: "Workspaces" },
			{ href: "/overview", label: "Overview" },
			{ href: "/team", label: "Team" },
			{ href: "/integrations", label: "Products" },
			{ href: "/activity", label: "Activity" },
		]);
	});
});
