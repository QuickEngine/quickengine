import { describe, expect, it } from "vitest";
import {
	fulfillmentKinds,
	fulfillmentModule,
	fulfillmentSettingsSchema,
} from "./module";
import { canTransition, FULFILLMENT_STATUSES } from "./status";

describe("fulfillment status machine", () => {
	it("allows work to start and finish", () => {
		expect(canTransition("pending", "in_progress")).toBe(true);
		expect(canTransition("in_progress", "fulfilled")).toBe(true);
	});

	it("allows immediate fulfillment", () => {
		expect(canTransition("pending", "fulfilled")).toBe(true);
	});

	it("allows unfinished work to be cancelled", () => {
		expect(canTransition("pending", "cancelled")).toBe(true);
		expect(canTransition("in_progress", "cancelled")).toBe(true);
	});

	it("treats fulfilled and cancelled records as terminal", () => {
		expect(canTransition("fulfilled", "pending")).toBe(false);
		expect(canTransition("cancelled", "in_progress")).toBe(false);
	});

	it("has no self-loops", () => {
		for (const status of FULFILLMENT_STATUSES) {
			expect(canTransition(status, status)).toBe(false);
		}
	});
});

describe("fulfillment settings", () => {
	it("defaults to a generic delivery experience", () => {
		expect(fulfillmentSettingsSchema.parse({})).toEqual({
			defaultKind: "other",
			completionLabel: "Delivered",
		});
	});

	it("accepts every universal fulfillment kind", () => {
		for (const kind of fulfillmentKinds) {
			expect(
				fulfillmentSettingsSchema.parse({ defaultKind: kind }).defaultKind,
			).toBe(kind);
		}
	});

	it("rejects an empty completion label", () => {
		expect(() =>
			fulfillmentSettingsSchema.parse({ completionLabel: "" }),
		).toThrow();
	});
});

describe("fulfillment manifest", () => {
	it("closes the foundation after Payments", () => {
		expect(fulfillmentModule.dependsOn).toEqual(["payments"]);
	});

	it("does not meter the act of delivering work", () => {
		expect(fulfillmentModule.meteredAction).toBeNull();
	});

	it("exposes a stable shared identity", () => {
		expect(fulfillmentModule.id).toBe("fulfillment");
		expect(fulfillmentModule.kind).toBe("shared");
	});
});
