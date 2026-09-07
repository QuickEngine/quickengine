import { describe, expect, it } from "vitest";
import { PURGE_AFTER_HOURS } from "../src/retention";

/**
 * 🔴 Media was erased from object storage the instant it came off a product.
 * Two videos went that way on 2026-09-07, within a minute of that behaviour
 * shipping, and nothing could bring them back.
 *
 * A removal is now a mark, the file is kept, and a sweep collects it later.
 */
describe("the removal grace window", () => {
	it("keeps a removed file long enough to change your mind", () => {
		// Undo lives in the screen where the removal happened, so this only has to
		// outlast a tab closed by accident.
		expect(PURGE_AFTER_HOURS).toBeGreaterThanOrEqual(1);
	});

	it("does not carry dead bytes for weeks", () => {
		// ⚠️ Every hour here is storage we pay for against a recovery nobody can
		// still ask for: the undo control is gone the moment the panel closes.
		expect(PURGE_AFTER_HOURS).toBeLessThanOrEqual(48);
	});
});
