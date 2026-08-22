import { describe, expect, it } from "vitest";
import { CarrierError } from "../carrier";
import { decimalStringToCents, mapTrackingStatus } from "./shippo";

/**
 * 🔴 The boundary where integer cents get lost.
 *
 * Shippo returns money as a decimal STRING — `"63.94"`, `"9.5"`, `"12"` — and
 * this system holds money as integer cents everywhere else. A float in the
 * middle produces a shipping price a cent out, which disagrees with the
 * carrier's invoice every month and is never quite wrong enough to investigate.
 *
 * Every value below came off a real Shippo response.
 */
describe("reading a carrier's price", () => {
	it("converts what Shippo actually sends", () => {
		expect(decimalStringToCents("63.94")).toBe(6394);
		expect(decimalStringToCents("9.54")).toBe(954);
		expect(decimalStringToCents("12.97")).toBe(1297);
		expect(decimalStringToCents("88.03")).toBe(8803);
	});

	it("handles one decimal place and none at all", () => {
		expect(decimalStringToCents("9.5")).toBe(950);
		expect(decimalStringToCents("12")).toBe(1200);
		expect(decimalStringToCents("0.07")).toBe(7);
	});

	/**
	 * ⚠️ Truncated, NOT rounded. A carrier quoting sub-cent precision is not
	 * offering to be paid it, and rounding up overcharges the customer a fraction
	 * of a cent on every single order.
	 */
	it("truncates below the cent rather than rounding up", () => {
		expect(decimalStringToCents("10.999")).toBe(1099);
		expect(decimalStringToCents("0.009")).toBe(0);
	});

	it("survives whitespace and negatives", () => {
		expect(decimalStringToCents("  15.17  ")).toBe(1517);
		expect(decimalStringToCents("-4.20")).toBe(-420);
	});

	/**
	 * 🔴 Throws rather than returning zero. A zero here reads as free shipping,
	 * which is the failure this whole seam exists to prevent.
	 */
	it("refuses a price it cannot read instead of calling it free", () => {
		for (const bad of ["free", "", "12.3.4", "1e3", "$9.99", "NaN"]) {
			expect(() => decimalStringToCents(bad)).toThrow(CarrierError);
		}
	});
});

/**
 * ⚠️ An unmapped status returns null rather than a guess. A status nobody has
 * decided what to do about must not quietly become "on its way" — that marks a
 * returned parcel as in transit and stops anybody chasing it.
 */
describe("translating a carrier's tracking words", () => {
	it("maps the states that mean something", () => {
		expect(mapTrackingStatus("TRANSIT")).toBe("in_transit");
		expect(mapTrackingStatus("DELIVERED")).toBe("delivered");
		expect(mapTrackingStatus("FAILURE")).toBe("exception");
		expect(mapTrackingStatus("RETURNED")).toBe("returned");
	});

	it("treats nothing-has-happened-yet as not news", () => {
		expect(mapTrackingStatus("PRE_TRANSIT")).toBeNull();
		expect(mapTrackingStatus("UNKNOWN")).toBeNull();
	});

	it("refuses to guess at a status it has never seen", () => {
		expect(mapTrackingStatus("SOMETHING_NEW")).toBeNull();
		expect(mapTrackingStatus(undefined)).toBeNull();
	});
});
