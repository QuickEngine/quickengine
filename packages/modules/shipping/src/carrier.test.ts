import { describe, expect, it } from "vitest";
import { CarrierError } from "./carrier";
import {
	getShippingCarrier,
	isConnectableCarrier,
	UnsupportedShippingCarrierError,
} from "./carriers";

/**
 * 🔴 What these tests actually defend is the REFUSAL.
 *
 * `rates.ts` refuses rather than guessing, and that behaviour has to survive
 * the carrier integration. A carrier that cannot answer must reach the customer
 * as "we cannot price this right now" and never as free shipping — a merchant
 * who gave delivery away because an API call timed out has been failed by us,
 * and every order placed in that window is already out the door.
 */
describe("the shipping carrier seam", () => {
	it("always resolves manual, so no caller has to check for null", () => {
		expect(getShippingCarrier("manual").id).toBe("manual");
	});

	it("names a carrier it does not have rather than returning nothing", () => {
		expect(() => getShippingCarrier("shippo")).toThrow(
			UnsupportedShippingCarrierError,
		);
		expect(() => getShippingCarrier("shippo")).toThrow(/shippo/);
	});

	it("does not pretend manual is a connectable carrier", () => {
		expect(isConnectableCarrier("manual")).toBe(false);
		expect(isConnectableCarrier("shippo")).toBe(false);
	});

	it("refuses to quote without a carrier instead of returning no rates", async () => {
		const carrier = getShippingCarrier("manual");
		await expect(
			carrier.quote({
				workspaceId: "ws_1",
				from: {
					name: "Caffeinate",
					line1: "1 Roastery Way",
					city: "Calgary",
					region: "AB",
					postalCode: "T2P 1J9",
					countryCode: "CA",
				},
				to: {
					name: "Ada Lovelace",
					line1: "12 Marylebone Rd",
					city: "Toronto",
					region: "ON",
					postalCode: "M5V 2T6",
					countryCode: "CA",
				},
				parcels: [
					{
						lengthMm: 200,
						widthMm: 150,
						heightMm: 100,
						weightGrams: 500,
					},
				],
			}),
		).rejects.toThrow(CarrierError);
	});

	/**
	 * ⚠️ The distinction that matters. An empty array would be read as "priced at
	 * nothing"; a throw can only ever be reported.
	 */
	it("reports a missing carrier as a code, not as an empty result", async () => {
		const carrier = getShippingCarrier("manual");
		await carrier
			.quote({
				workspaceId: "ws_1",
				from: {
					name: "A",
					line1: "1",
					city: "C",
					postalCode: "P",
					countryCode: "CA",
				},
				to: {
					name: "B",
					line1: "2",
					city: "D",
					postalCode: "Q",
					countryCode: "CA",
				},
				parcels: [{ lengthMm: 1, widthMm: 1, heightMm: 1, weightGrams: 1 }],
			})
			.then(
				() => expect.unreachable("a missing carrier must never quote"),
				(error: CarrierError) =>
					expect(error.code).toBe("CARRIER_NOT_CONFIGURED"),
			);
	});

	it("refuses to spend money it has no carrier to spend with", async () => {
		const carrier = getShippingCarrier("manual");
		await expect(
			carrier.buyLabel({ workspaceId: "ws_1", carrierRateId: "rate_1" }),
		).rejects.toThrow(CarrierError);
	});

	/** Nothing was bought, so "no" is a true answer rather than a failure. */
	it("answers no to voiding a label that never existed", async () => {
		const carrier = getShippingCarrier("manual");
		expect(
			await carrier.voidLabel({
				workspaceId: "ws_1",
				externalLabelId: "label_1",
			}),
		).toBe(false);
	});

	/** Same rule as the payment webhooks: never say why verification failed. */
	it("verifies no webhook and explains nothing", async () => {
		const carrier = getShippingCarrier("manual");
		expect(
			await carrier.verifyWebhook({ rawBody: "{}", headers: {} }, "ws_1"),
		).toBeNull();
	});
});
