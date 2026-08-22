import type { ShippingCarrier, ShippingCarrierId } from "../carrier";
import { manualShippingCarrier } from "./manual";

/**
 * Which carriers exist.
 *
 * Adding Shippo means writing one file next to `manual.ts` and adding a line
 * here. Nothing above the seam changes — that is the entire point of
 * `carrier.ts`, and the reason `DECISIONS.md` records the Shippo-over-EasyPost
 * choice as cheap to revisit.
 *
 * 🔴 `shippo` and `easypost` are absent because they are NOT WRITTEN. That is
 * deliberate, not an oversight: without an account there is nothing to prove an
 * adapter against, and this project's worst bugs have all been in integration
 * code nobody could run. Asking for one today gets a named refusal rather than
 * a silent nothing.
 *
 * ⚠️ Unlike payments, `manual` IS present here. A manual payment already
 * happened in person and has nothing to implement; a manual SHIPMENT is an
 * ongoing arrangement a caller may legitimately ask to price, and the honest
 * answer is a refusal it can show somebody.
 */
const CARRIERS: Partial<Record<ShippingCarrierId, ShippingCarrier>> = {
	manual: manualShippingCarrier,
};

export class UnsupportedShippingCarrierError extends Error {
	constructor(readonly carrier: string) {
		super(`No shipping integration is configured for "${carrier}".`);
	}
}

/**
 * The integration for a carrier name, or a thrown error naming it.
 *
 * Throws rather than returning null for the same reason the payments registry
 * does: every caller is about to quote a customer or spend a merchant's money,
 * and silently continuing with no carrier is how a checkout offers free
 * delivery it never meant to.
 */
export function getShippingCarrier(carrier: string): ShippingCarrier {
	const found = CARRIERS[carrier as ShippingCarrierId];
	if (!found) throw new UnsupportedShippingCarrierError(carrier);
	return found;
}

/** Whether a carrier can be called, as opposed to only recorded by hand. */
export function isConnectableCarrier(carrier: string): boolean {
	return carrier in CARRIERS && carrier !== "manual";
}

export { manualShippingCarrier };
