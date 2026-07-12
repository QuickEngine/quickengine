import { describe, expect, it } from "vitest";
import { applicationFeeCents, netToConnectedAccountCents } from "./fees";
import { paymentsModule, paymentsSettingsSchema } from "./module";
import { canTransition, PAYMENT_STATUSES } from "./status";

describe("application fee", () => {
	it("is zero by default (no fee configured)", () => {
		// The whole point: you don't pay to receive your own money unless a plan
		// explicitly turns on a share.
		expect(applicationFeeCents(10_000, 0)).toBe(0);
	});

	it("computes a basis-point share of the amount", () => {
		// 250 bps = 2.5% of $100.00 = $2.50
		expect(applicationFeeCents(10_000, 250)).toBe(250);
	});

	it("floors to whole cents (never over-charges by rounding up)", () => {
		// 1% of 99 cents = 0.99 cents → floors to 0, not 1.
		expect(applicationFeeCents(99, 100)).toBe(0);
		// 2.5% of 1001 cents = 25.025 → 25.
		expect(applicationFeeCents(1001, 250)).toBe(25);
	});

	it("can never exceed the payment itself", () => {
		// A misconfigured 200% fee still can't take more than the whole amount.
		expect(applicationFeeCents(500, 20_000)).toBe(500);
	});

	it("is zero for a zero or negative amount", () => {
		expect(applicationFeeCents(0, 250)).toBe(0);
		expect(applicationFeeCents(-100, 250)).toBe(0);
	});

	it("leaves the rest for the connected account", () => {
		expect(netToConnectedAccountCents(10_000, 250)).toBe(9_750);
		// Fee somehow larger than amount never yields a negative payout.
		expect(netToConnectedAccountCents(100, 500)).toBe(0);
	});
});

describe("payment status machine", () => {
	it("allows the happy path pending → processing → succeeded", () => {
		expect(canTransition("pending", "processing")).toBe(true);
		expect(canTransition("processing", "succeeded")).toBe(true);
	});

	it("allows fast confirmation pending → succeeded", () => {
		expect(canTransition("pending", "succeeded")).toBe(true);
	});

	it("only refunds a succeeded payment", () => {
		expect(canTransition("succeeded", "refunded")).toBe(true);
		expect(canTransition("pending", "refunded")).toBe(false);
		expect(canTransition("failed", "refunded")).toBe(false);
	});

	it("treats failed and refunded as terminal", () => {
		expect(canTransition("failed", "succeeded")).toBe(false);
		expect(canTransition("refunded", "succeeded")).toBe(false);
	});

	it("has no self-loops", () => {
		for (const status of PAYMENT_STATUSES) {
			expect(canTransition(status, status)).toBe(false);
		}
	});
});

describe("payments settings", () => {
	it("defaults currency to USD", () => {
		expect(paymentsSettingsSchema.parse({}).defaultCurrency).toBe("USD");
	});

	it("rejects a statement descriptor over Stripe's 22-char cap", () => {
		expect(() =>
			paymentsSettingsSchema.parse({ statementDescriptor: "x".repeat(23) }),
		).toThrow();
	});

	it("does not let a workspace set its own platform fee", () => {
		// The platform fee is revenue policy, set at the plan layer — never a
		// workspace-facing setting.
		expect(
			paymentsSettingsSchema.parse({}) as Record<string, unknown>,
		).not.toHaveProperty("platformFeeBps");
	});
});

describe("payments manifest", () => {
	it("depends on Invoicing (a payment settles an invoice)", () => {
		expect(paymentsModule.dependsOn).toContain("invoicing");
	});

	it("is not metered (getting paid is not billable infrastructure)", () => {
		expect(paymentsModule.meteredAction).toBeNull();
	});

	it("exposes a stable identity", () => {
		expect(paymentsModule.id).toBe("payments");
		expect(paymentsModule.kind).toBe("shared");
	});
});
