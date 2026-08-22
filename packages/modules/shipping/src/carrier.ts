// ─────────────────────────────────────────────────────────────────────────────
// THE SHIPPING CARRIER SEAM.
//
// 🔴 Every call that leaves this system to price or buy a parcel crosses this
// interface. Nothing above it may import Shippo, name Shippo, or assume Shippo.
//
// Why it exists, from `DECISIONS.md` 2026-08-19: Shippo was chosen over
// EasyPost on cost, and that choice is only cheap to revisit BECAUSE it sits
// behind an interface. Shippo, EasyPost and `manual` are one file each, so
// picking wrong costs a file rather than a rewrite. The seam is deliberately
// built BEFORE the adapter, for the same reason the payments seam was.
//
// ⚠️ The adapter itself is NOT written, on purpose. Without an account there is
// nothing to prove it against, and unverified integration code is where this
// project's bugs have consistently hidden — the connect webhook secret, the API
// key that was never displayed, the supplier address that never rendered. The
// Shippo file waits for a token.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a carrier integration is called.
 *
 * ⚠️ These strings reach the database the moment a label is stored against a
 * shipment. Renaming one orphans every historical row written under the old
 * name, so treat them as permanent identifiers rather than display labels.
 */
export type ShippingCarrierId = "shippo" | "easypost" | "manual";

/** Where a parcel goes, or comes from. */
export type CarrierAddress = {
	name: string;
	company?: string | null;
	line1: string;
	line2?: string | null;
	city: string;
	/** Province or state, in the carrier's expected short form. */
	region?: string | null;
	postalCode: string;
	/** ISO 3166-1 alpha-2. */
	countryCode: string;
	phone?: string | null;
	/**
	 * ⚠️ Optional, and frequently omitted on purpose. A supplier fulfilling a
	 * dropship order receives the delivery address and never the customer's
	 * email, so anything reusing this type for a supplier handoff must leave it
	 * unset. See the Collective suppression in `handoff/shopify.ts`.
	 */
	email?: string | null;
};

/**
 * One box, as the carrier needs to price it.
 *
 * 🔴 Millimetres and grams, integers. The same rule as money: a float here is a
 * dimension that disagrees with itself between two calls, and a carrier that
 * re-measures at the depot bills the difference to the merchant.
 */
export type Parcel = {
	lengthMm: number;
	widthMm: number;
	heightMm: number;
	weightGrams: number;
};

/** One option the carrier is willing to sell, for one parcel to one address. */
export type CarrierRate = {
	/**
	 * The carrier's own id for this quote.
	 *
	 * 🔴 Required to buy the label later, and usually SHORT-LIVED. A rate is a
	 * price the carrier is honouring for a window, so a quote stored and bought
	 * against days later will be refused — the buy path must handle that as an
	 * ordinary outcome rather than an error nobody expected.
	 */
	carrierRateId: string;
	/** Who carries it: "Canada Post", "UPS". Free text from the carrier. */
	carrier: string;
	/** Which service: "Expedited Parcel", "Ground". Free text from the carrier. */
	service: string;
	amountCents: number;
	currency: string;
	estimatedDaysMin: number | null;
	estimatedDaysMax: number | null;
};

/** What comes back when a label is actually bought. Money has moved by now. */
export type PurchasedLabel = {
	/** The carrier's id for the purchase, so a refund or void can find it. */
	externalLabelId: string;
	carrier: string;
	service: string;
	trackingNumber: string;
	trackingUrl: string | null;
	/** Where the printable label lives. Usually a short-lived carrier URL. */
	labelUrl: string;
	amountCents: number;
	currency: string;
};

/** A carrier telling us a parcel moved. */
export type CarrierTrackingUpdate = {
	trackingNumber: string;
	carrier: string;
	/** Mapped to OUR vocabulary, never the carrier's own status strings. */
	status: "in_transit" | "delivered" | "exception" | "returned";
	/** What the carrier said, kept verbatim for an operator to read. */
	detail: string | null;
	occurredAt: Date;
};

/**
 * A carrier refused, and the refusal is the answer.
 *
 * 🔴 THE most important rule in this file. `rates.ts` already refuses rather
 * than guessing — `NO_ZONE_FOR_DESTINATION`, `NO_RATE_FOR_BASKET`,
 * `MISSING_ITEM_WEIGHT` — and that behaviour must survive the integration.
 *
 * A carrier timeout, an empty rate list or a malformed response must reach the
 * customer as "we cannot price this right now", NEVER as free shipping. Free
 * shipping is a merchant's deliberate choice; a merchant who discovers they
 * gave it away because an API call timed out has been failed by us, and every
 * order placed in that window is already gone.
 */
export class CarrierError extends Error {
	constructor(
		readonly code:
			| "CARRIER_UNAVAILABLE"
			| "CARRIER_NO_RATES"
			| "CARRIER_REJECTED_ADDRESS"
			| "CARRIER_RATE_EXPIRED"
			| "CARRIER_NOT_CONFIGURED",
		message: string,
		readonly detail?: Record<string, unknown>,
	) {
		super(message);
		this.name = "CarrierError";
	}
}

export interface ShippingCarrier {
	readonly id: ShippingCarrierId;

	/**
	 * What this parcel costs to send, as options to choose between.
	 *
	 * 🔴 Throws `CarrierError` rather than returning an empty array when the
	 * carrier could not answer. An empty array and "the carrier is down" are
	 * different facts, and collapsing them is how a checkout silently offers
	 * nothing and a customer leaves.
	 */
	quote(params: {
		workspaceId: string;
		from: CarrierAddress;
		to: CarrierAddress;
		parcels: Parcel[];
	}): Promise<CarrierRate[]>;

	/**
	 * Buy a label. **This spends the merchant's money.**
	 *
	 * ⚠️ Not idempotent at the carrier, so the caller owns the guard. Buying the
	 * same label twice bills twice and produces two tracking numbers for one
	 * parcel, which then disagree in front of the customer.
	 */
	buyLabel(params: {
		workspaceId: string;
		carrierRateId: string;
	}): Promise<PurchasedLabel>;

	/**
	 * Cancel an unused label and reclaim its cost, where the carrier allows it.
	 *
	 * Returns false when the carrier declines — usually because the parcel has
	 * already been scanned, which is not an error and must not be reported as
	 * one.
	 */
	voidLabel(params: {
		workspaceId: string;
		externalLabelId: string;
	}): Promise<boolean>;

	/**
	 * Verify a carrier webhook and translate it, or return null.
	 *
	 * 🔴 Returns null for ANY failure and never says which. A caller who cannot
	 * sign must not learn whether the secret is missing, the timestamp stale or
	 * the digest wrong — the same rule the payment webhooks follow.
	 */
	verifyWebhook(
		request: { rawBody: string; headers: Record<string, string> },
		workspaceId: string,
	): Promise<CarrierTrackingUpdate | null>;
}
