import { describe, expect, it } from "vitest";
import { normalizePortalHost } from "./workspace-branding";

/**
 * 🔴 Both sides of the custom-domain lookup go through this. An operator pastes
 * `https://Account.Gemsutopia.ca/` into a settings field; a browser sends
 * `account.gemsutopia.ca`. If the two normalise differently the lookup silently
 * never matches, and the symptom is "my portal domain doesn't work" with nothing
 * in the logs.
 */
describe("portal host normalisation", () => {
	it("accepts a bare hostname unchanged", () => {
		expect(normalizePortalHost("account.gemsutopia.ca")).toBe(
			"account.gemsutopia.ca",
		);
	});

	it("reduces whatever an operator is likely to paste", () => {
		for (const typed of [
			"https://account.gemsutopia.ca",
			"https://account.gemsutopia.ca/",
			"https://account.gemsutopia.ca/orders",
			"Account.Gemsutopia.CA",
			"  account.gemsutopia.ca  ",
			"account.gemsutopia.ca:443",
			// A trailing dot is a valid FQDN and browsers strip it.
			"account.gemsutopia.ca.",
		]) {
			expect(normalizePortalHost(typed), typed).toBe("account.gemsutopia.ca");
		}
	});

	it("rejects anything that is not a plausible public hostname", () => {
		for (const bad of [
			"",
			"   ",
			"localhost",
			"not a domain",
			"*.gemsutopia.ca",
			"http://",
			"gemsutopia",
			"-leading-dash.com",
			"trailing-dash-.com",
		]) {
			expect(normalizePortalHost(bad), bad).toBeNull();
		}
	});

	it("rejects localhost specifically", () => {
		// A custom portal domain is a public one. Accepting localhost would put a
		// developer's machine into a UNIQUE column shared by every workspace.
		expect(normalizePortalHost("localhost")).toBeNull();
		expect(normalizePortalHost("http://localhost:3012")).toBeNull();
	});

	it("keeps a subdomain of a subdomain", () => {
		expect(normalizePortalHost("shop.account.gemsutopia.ca")).toBe(
			"shop.account.gemsutopia.ca",
		);
	});
});
