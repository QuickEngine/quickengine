import {
	CarrierError,
	type CarrierRate,
	type CarrierTrackingUpdate,
	type PurchasedLabel,
	type ShippingCarrier,
} from "../carrier";

/**
 * No carrier at all, expressed honestly.
 *
 * 🔴 This is what EVERY workspace uses today, and it is not a stub. A business
 * prices delivery from its own zones and bands in `rates.ts`, writes the
 * carrier and tracking number on a shipment by hand, and never calls anybody.
 * That is a complete, working way to run a shop, and plenty of businesses will
 * stay on it forever.
 *
 * ⚠️ It exists so the registry always resolves to SOMETHING. A caller that has
 * to check for null before every carrier call is a caller that will eventually
 * forget, and the forgotten branch is the one that ships. Refusing loudly here
 * is better than a null nobody handles.
 *
 * ⚠️ Refusing is also why this file cannot silently become a fallback. When a
 * real carrier times out, resolving to `manual` and getting an empty rate list
 * would read as "free shipping" at checkout. `CARRIER_NOT_CONFIGURED` can only
 * ever be reported, never mistaken for a price.
 */
export const manualShippingCarrier: ShippingCarrier = {
	id: "manual",

	async verifyCredentials(): Promise<void> {
		throw new CarrierError(
			"CARRIER_NOT_CONFIGURED",
			"This business has not connected a carrier, so there is nothing to verify.",
		);
	},

	async quote(): Promise<CarrierRate[]> {
		throw new CarrierError(
			"CARRIER_NOT_CONFIGURED",
			"This business has not connected a carrier, so live rates cannot be fetched.",
		);
	},

	async buyLabel(): Promise<PurchasedLabel> {
		throw new CarrierError(
			"CARRIER_NOT_CONFIGURED",
			"This business has not connected a carrier, so a label cannot be bought.",
		);
	},

	/**
	 * Nothing was ever bought, so nothing can be voided. False rather than a
	 * throw: "there is no label to cancel" is a true answer to the question, not
	 * a failure to answer it.
	 */
	async voidLabel(): Promise<boolean> {
		return false;
	},

	/** Nobody signs webhooks for a carrier that was never connected. */
	async verifyWebhook(): Promise<CarrierTrackingUpdate | null> {
		return null;
	},
};
