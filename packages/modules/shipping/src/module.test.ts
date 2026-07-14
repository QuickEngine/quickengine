import { describe, expect, it } from "vitest";
import { shippingModule, shippingSettingsSchema } from "./module";
import {
	assertShipmentQuantityAllowed,
	canTransitionShipment,
	shipmentInputSchema,
	shipmentParcelSchema,
	shipmentTrackingPatchSchema,
	shippingAddressSchema,
} from "./shipment";

const orderId = "00000000-0000-4000-8000-000000000001";
const firstLineId = "00000000-0000-4000-8000-000000000002";

const destination = {
	recipientName: "  Ada Lovelace ",
	line1: " 123 Engine Way ",
	city: " London ",
	postalCode: " SW1A 1AA ",
	countryCode: "gb",
	email: " ADA@EXAMPLE.COM ",
};

describe("shipping module", () => {
	it("depends on Orders and does not meter shipment records", () => {
		expect(shippingModule).toMatchObject({
			id: "shipping",
			dependsOn: ["orders"],
			meteredAction: null,
		});
	});

	it("has conservative workspace defaults", () => {
		expect(shippingSettingsSchema.parse({})).toEqual({
			defaultOriginCountry: "US",
			defaultCarrier: null,
			requireTracking: false,
		});
	});
});

describe("shipment contract", () => {
	it("normalizes a portable international address snapshot", () => {
		expect(shippingAddressSchema.parse(destination)).toMatchObject({
			recipientName: "Ada Lovelace",
			countryCode: "GB",
			email: "ada@example.com",
		});
	});

	it("does not invent a postal-code requirement for countries without one", () => {
		expect(
			shippingAddressSchema.parse({
				recipientName: "Customer",
				line1: "Central District",
				city: "Hong Kong",
				countryCode: "HK",
			}),
		).toMatchObject({ countryCode: "HK", postalCode: null });
	});

	it("ships selected quantities so an order can be split", () => {
		expect(
			shipmentInputSchema.parse({
				orderId,
				lines: [{ orderLineItemId: firstLineId, quantity: 2 }],
				destination,
				parcels: [{ weightGrams: 500 }],
			}),
		).toMatchObject({
			orderId,
			lines: [{ orderLineItemId: firstLineId, quantity: 2 }],
		});
	});

	it("rejects a repeated order line inside one shipment", () => {
		expect(() =>
			shipmentInputSchema.parse({
				orderId,
				lines: [
					{ orderLineItemId: firstLineId, quantity: 1 },
					{ orderLineItemId: firstLineId, quantity: 1 },
				],
				destination,
				parcels: [{ weightGrams: 500 }],
			}),
		).toThrow();
	});

	it("requires all parcel dimensions or none", () => {
		expect(() =>
			shipmentParcelSchema.parse({
				weightGrams: 500,
				lengthMillimeters: 100,
			}),
		).toThrow();
		expect(
			shipmentParcelSchema.parse({
				weightGrams: 500,
				lengthMillimeters: 100,
				widthMillimeters: 80,
				heightMillimeters: 40,
			}),
		).toMatchObject({ weightGrams: 500 });
	});

	it("tracks shipment progress and terminal states", () => {
		expect(canTransitionShipment("draft", "ready")).toBe(true);
		expect(canTransitionShipment("ready", "shipped")).toBe(true);
		expect(canTransitionShipment("shipped", "in_transit")).toBe(true);
		expect(canTransitionShipment("in_transit", "delivered")).toBe(true);
		expect(canTransitionShipment("delivered", "shipped")).toBe(false);
		expect(canTransitionShipment("cancelled", "draft")).toBe(false);
	});

	it("allows split allocation up to the ordered quantity but never beyond it", () => {
		expect(() => assertShipmentQuantityAllowed(5, 2, 3)).not.toThrow();
		expect(() => assertShipmentQuantityAllowed(5, 2, 4)).toThrow(
			"ORDER_LINE_OVERSHIPPED",
		);
	});

	it("accepts narrow carrier tracking updates but rejects empty patches", () => {
		expect(
			shipmentTrackingPatchSchema.parse({
				carrier: "Postal Service",
				trackingNumber: "TRACK-123",
				trackingUrl: " https://example.com/track/TRACK-123 ",
			}),
		).toMatchObject({ trackingNumber: "TRACK-123" });
		expect(() => shipmentTrackingPatchSchema.parse({})).toThrow();
	});
});
