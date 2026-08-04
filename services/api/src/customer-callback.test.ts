import { describe, expect, it } from "vitest";
import { isAllowedCustomerCallback } from "./customer-callback";

describe("customer sign-in callbacks", () => {
	it("accepts a path on the storefront key's exact registered origin", () => {
		expect(
			isAllowedCustomerCallback(
				"https://gemsutopia.ca/auth/verify?next=%2Fwishlist",
				["https://gemsutopia.ca"],
			),
		).toBe(true);
	});

	it("rejects lookalikes, other merchants, and unregistered ports", () => {
		const allowed = ["https://gemsutopia.ca"];
		expect(
			isAllowedCustomerCallback(
				"https://gemsutopia.ca.evil.test/verify",
				allowed,
			),
		).toBe(false);
		expect(
			isAllowedCustomerCallback(
				"https://another-merchant.test/verify",
				allowed,
			),
		).toBe(false);
		expect(
			isAllowedCustomerCallback("https://gemsutopia.ca:444/verify", allowed),
		).toBe(false);
	});
});
