import { describe, expect, it } from "vitest";
import {
	getSupplierAdapter,
	isAutomatedHandoff,
	UnsupportedHandoffMethodError,
} from "./index";

describe("supplier handoff registry", () => {
	/**
	 * ⚠️ `email` and `manual` must NEVER gain an adapter.
	 *
	 * An email handoff is a mail send performed by `supplier-handoff.ts`, and a
	 * manual one is a person. A stub here would invite code to call `placeOrder`
	 * on a supplier that only ever receives a plain email — which fails silently,
	 * because nothing would be sent and the purchase order would read as handled.
	 */
	it("does not treat email or manual as automated", () => {
		expect(isAutomatedHandoff("email")).toBe(false);
		expect(isAutomatedHandoff("manual")).toBe(false);
		expect(isAutomatedHandoff("unknown")).toBe(false);
		expect(isAutomatedHandoff("portal")).toBe(false);
	});

	it("throws a named error rather than returning nothing", () => {
		// Throwing is deliberate: every caller is about to commit a business to
		// buying stock, and a silent null is how a purchase order gets marked sent
		// while no supplier ever heard of it.
		expect(() => getSupplierAdapter("email")).toThrow(
			UnsupportedHandoffMethodError,
		);
		expect(() => getSupplierAdapter("nonsense")).toThrow(
			/No supplier integration is configured for "nonsense"/,
		);
	});

	/**
	 * 🔴 The CI guard. Hard rule 12 in `CLAUDE.md`, broken three times in one day.
	 *
	 * This module is reachable from `registerAllRoutes` through the supplier
	 * webhook route, so anything it pulls in at module level lands in the graph of
	 * route registration, of `openapi.test.ts`, and of every cold start. The
	 * symptom is always the same and always misleading: `openapi.test.ts` timing
	 * out at 5000ms, which reads as a missing route.
	 *
	 * Adapters must reach their transport through `await import()` inside the
	 * function that calls it, never at the top of a file.
	 */
	it("imports without dragging a network client into the module graph", async () => {
		const started = performance.now();
		await import("./index");
		expect(performance.now() - started).toBeLessThan(250);

		const heavy = ["shopify", "stripe", "resend", "axios", "node-fetch"];
		const loaded = Object.keys(
			(globalThis as { require?: { cache?: Record<string, unknown> } }).require
				?.cache ?? {},
		);
		for (const name of heavy) {
			expect(loaded.some((path) => path.includes(`/${name}/`))).toBe(false);
		}
	});
});
