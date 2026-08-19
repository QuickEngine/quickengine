import { describe, expect, it } from "vitest";
import { checkoutInputSchema } from "./checkout";

/**
 * 🔴 The checkout input schema is a security boundary, not a convenience.
 *
 * A storefront key ships in page source, so anyone can send anything to this
 * endpoint. The only thing that makes that survivable is that the request names
 * WHAT is being bought and never WHAT IT COSTS.
 *
 * Zod strips unknown keys by default, so a hostile field does not reach the
 * handler — but "it currently strips it" is exactly the sort of thing an
 * innocuous refactor (`.passthrough()`, a spread, a schema merge) undoes
 * silently. These tests fail loudly if it ever stops being true.
 */
describe("checkout input cannot influence money", () => {
	const valid = {
		items: [
			{ catalogItemId: "11111111-1111-4111-8111-111111111111", quantity: 2 },
		],
		email: "buyer@example.com",
	};

	it("accepts a minimal, honest checkout", () => {
		const parsed = checkoutInputSchema.parse(valid);
		expect(parsed.items).toHaveLength(1);
		expect(parsed.email).toBe("buyer@example.com");
	});

	it.each([
		"unitPriceCents",
		"priceCents",
		"subtotalCents",
		"totalCents",
		"taxCents",
		"discountCents",
		"currency",
	])("drops a caller-supplied %s", (field) => {
		const parsed = checkoutInputSchema.parse({
			...valid,
			[field]: 1,
		}) as Record<string, unknown>;
		expect(parsed[field]).toBeUndefined();
	});

	it("drops a caller-supplied clientId", () => {
		// The prototype accepted this and never checked it belonged to the
		// storefront, which let one shop attach an order to another shop's
		// customer. The client record here comes from the email instead.
		const parsed = checkoutInputSchema.parse({
			...valid,
			clientId: "22222222-2222-4222-8222-222222222222",
		}) as Record<string, unknown>;
		expect(parsed.clientId).toBeUndefined();
	});

	it("drops a per-line price even when the line is otherwise valid", () => {
		const parsed = checkoutInputSchema.parse({
			...valid,
			items: [{ ...valid.items[0], unitPriceCents: 1 }],
		});
		expect(parsed.items?.[0]).not.toHaveProperty("unitPriceCents");
	});

	it("refuses a basket and a subscription plan together", () => {
		// 🔴 Both would let somebody subscribe to one thing and be charged for
		// another: the plan's price against the basket's contents.
		expect(() =>
			checkoutInputSchema.parse({
				...valid,
				subscriptionPlanId: "3f1b2c40-0000-4000-8000-00000000ab01",
			}),
		).toThrow();
	});

	it("refuses neither a basket nor a subscription plan", () => {
		const { items, ...withoutItems } = valid;
		expect(() => checkoutInputSchema.parse(withoutItems)).toThrow();
	});

	it("requires an email, because a guest order with no address is unreachable", () => {
		expect(() => checkoutInputSchema.parse({ items: valid.items })).toThrow();
	});

	it("rejects an empty basket", () => {
		expect(() => checkoutInputSchema.parse({ ...valid, items: [] })).toThrow();
	});

	it("caps quantity, so one request cannot reserve a merchant's whole stock", () => {
		expect(() =>
			checkoutInputSchema.parse({
				...valid,
				items: [{ ...valid.items[0], quantity: 1_000_001 }],
			}),
		).toThrow();
	});

	it("rejects a fractional or negative quantity", () => {
		for (const quantity of [0, -1, 1.5]) {
			expect(() =>
				checkoutInputSchema.parse({
					...valid,
					items: [{ ...valid.items[0], quantity }],
				}),
			).toThrow();
		}
	});

	it("caps the basket size", () => {
		const items = Array.from({ length: 101 }, () => valid.items[0]);
		expect(() => checkoutInputSchema.parse({ ...valid, items })).toThrow();
	});
});
