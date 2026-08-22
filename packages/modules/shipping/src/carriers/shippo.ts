import {
	type CarrierAddress,
	CarrierError,
	type CarrierRate,
	type CarrierTrackingUpdate,
	type Parcel,
	type PurchasedLabel,
	type ShippingCarrier,
} from "../carrier";
import type { CarrierCredentials } from "../carrier-credentials";

/**
 * Shippo, the first real carrier.
 *
 * ⚠️ Written against the LIVE API, not against the docs. Every shape below was
 * read off an actual response using a real test token, because this project's
 * worst bugs have all been in integration code nobody could run: the connect
 * webhook secret, the API key that never displayed, the supplier address that
 * never rendered.
 *
 * 🔴 The base URL belongs to the ADAPTER, never to the business. A merchant
 * supplies a token and nothing else; letting them supply a host would let a
 * compromised settings page point every rate request at somebody else's server.
 */
const SHIPPO_API = "https://api.goshippo.com";

/**
 * Shippo returns money as a DECIMAL STRING: `"63.94"`, `"9.5"`, `"12"`.
 *
 * 🔴 Parsed as text, never through a float. `Math.round(Number("63.94") * 100)`
 * happens to work; the same expression on other values does not, and a shipping
 * price that is a cent out is a price that disagrees with the carrier's invoice
 * every single month. This system holds money as integer cents everywhere else
 * and the boundary is where that discipline gets lost.
 *
 * Throws rather than returning 0 for anything unparseable, because a zero here
 * reads as free shipping.
 */
export function decimalStringToCents(value: string): number {
	const match = /^(-?)(\d+)(?:\.(\d{1,}))?$/.exec(value.trim());
	if (!match) {
		throw new CarrierError(
			"CARRIER_UNAVAILABLE",
			"The carrier returned a price that could not be read.",
			{ value },
		);
	}
	const [, sign, whole, fraction = ""] = match;
	// Two digits, padded if short. Anything beyond is truncated rather than
	// rounded: a carrier quoting sub-cent precision is not offering to be paid
	// it, and rounding up would overcharge a customer for a fraction of a cent.
	const cents = `${fraction}00`.slice(0, 2);
	const total = Number(whole) * 100 + Number(cents);
	return sign === "-" ? -total : total;
}

/** Grams to the kilogram string Shippo wants, without a float in sight. */
function gramsToKg(grams: number): string {
	const whole = Math.trunc(grams / 1000);
	const rest = String(grams % 1000).padStart(3, "0");
	return `${whole}.${rest}`;
}

function toShippoAddress(address: CarrierAddress) {
	return {
		name: address.name,
		company: address.company ?? undefined,
		street1: address.line1,
		street2: address.line2 ?? undefined,
		city: address.city,
		state: address.region ?? undefined,
		zip: address.postalCode,
		country: address.countryCode,
		phone: address.phone ?? undefined,
		email: address.email ?? undefined,
	};
}

function toShippoParcel(parcel: Parcel) {
	return {
		length: String(parcel.lengthMm / 10),
		width: String(parcel.widthMm / 10),
		height: String(parcel.heightMm / 10),
		distance_unit: "cm",
		weight: gramsToKg(parcel.weightGrams),
		mass_unit: "kg",
	};
}

async function shippo(
	credentials: CarrierCredentials,
	path: string,
	init: { method: string; body?: unknown } = { method: "GET" },
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(`${SHIPPO_API}${path}`, {
			method: init.method,
			headers: {
				Authorization: `ShippoToken ${credentials.apiToken}`,
				"Content-Type": "application/json",
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			// ⚠️ A carrier that hangs must not hang a checkout with it. The customer
			// is watching a spinner, and a refusal they can act on beats a request
			// that never returns.
			signal: AbortSignal.timeout(20_000),
		});
	} catch {
		throw new CarrierError(
			"CARRIER_UNAVAILABLE",
			"The carrier did not respond in time.",
		);
	}

	if (response.status === 401 || response.status === 403) {
		throw new CarrierError(
			"CARRIER_NOT_CONFIGURED",
			"The carrier rejected this account's token.",
		);
	}
	if (!response.ok) {
		throw new CarrierError(
			"CARRIER_UNAVAILABLE",
			`The carrier refused the request (${response.status}).`,
		);
	}
	return response.json();
}

type ShippoRate = {
	object_id: string;
	amount: string;
	currency: string;
	provider: string;
	estimated_days: number | null;
	servicelevel?: { name?: string | null } | null;
};

export const shippoCarrier: ShippingCarrier = {
	id: "shippo",

	/**
	 * The cheapest authenticated call Shippo has.
	 *
	 * Listing one address touches nothing, costs nothing, and answers the only
	 * question being asked: does this account exist and does this token open it.
	 * A 401 becomes `CARRIER_NOT_CONFIGURED` inside `shippo()` above.
	 */
	async verifyCredentials({ credentials }): Promise<void> {
		await shippo(credentials, "/addresses/?results=1");
	},

	async quote({ credentials, from, to, parcels }): Promise<CarrierRate[]> {
		const body = await shippo(credentials, "/shipments/", {
			method: "POST",
			body: {
				address_from: toShippoAddress(from),
				address_to: toShippoAddress(to),
				parcels: parcels.map(toShippoParcel),
				// 🔴 Synchronous. The async form returns a shipment id and expects
				// polling, which at checkout means a customer waiting on a spinner
				// while we ask again. Shippo answers in about a second.
				async: false,
			},
		});

		const shipment = body as {
			status?: string;
			rates?: ShippoRate[];
			messages?: Array<{ text?: string }>;
		};

		/**
		 * ⚠️ `messages` is NOT a failure. A real quote came back with eleven rates
		 * AND several messages, because carriers the account has enabled but which
		 * cannot serve this parcel each report why. Treating the presence of
		 * messages as an error would refuse every quote this account can make.
		 */
		const rates = shipment.rates ?? [];
		if (rates.length === 0) {
			/**
			 * 🔴 An empty list is a REFUSAL, never free shipping. This is the rule
			 * `rates.ts` already follows and the one the whole seam exists to
			 * protect: a merchant who gave delivery away because a carrier had
			 * nothing to say has been failed by us.
			 */
			throw new CarrierError(
				"CARRIER_NO_RATES",
				"No carrier would quote for that parcel and address.",
				{ carrierMessages: shipment.messages?.map((m) => m.text) ?? [] },
			);
		}

		return rates.map((rate) => ({
			carrierRateId: rate.object_id,
			carrier: rate.provider,
			service: rate.servicelevel?.name ?? rate.provider,
			amountCents: decimalStringToCents(rate.amount),
			currency: rate.currency,
			estimatedDaysMin: rate.estimated_days ?? null,
			estimatedDaysMax: rate.estimated_days ?? null,
		}));
	},

	async buyLabel({ credentials, carrierRateId }): Promise<PurchasedLabel> {
		const body = (await shippo(credentials, "/transactions/", {
			method: "POST",
			body: { rate: carrierRateId, label_file_type: "PDF", async: false },
		})) as {
			object_id: string;
			status: string;
			label_url?: string | null;
			tracking_number?: string | null;
			tracking_url_provider?: string | null;
			messages?: Array<{ text?: string }>;
			rate?: ShippoRate | string;
		};

		if (body.status !== "SUCCESS" || !body.label_url) {
			/**
			 * ⚠️ A rate is a price the carrier honours for a WINDOW. Buying against
			 * one quoted days ago is refused, and that is ordinary — the caller
			 * re-quotes rather than treating it as a fault.
			 */
			const said = body.messages?.map((m) => m.text).join("; ") ?? "";
			throw new CarrierError(
				"CARRIER_RATE_EXPIRED",
				said || "The carrier would not sell that rate any more.",
			);
		}

		const rate = typeof body.rate === "object" && body.rate ? body.rate : null;
		return {
			externalLabelId: body.object_id,
			carrier: rate?.provider ?? "",
			service: rate?.servicelevel?.name ?? "",
			trackingNumber: body.tracking_number ?? "",
			trackingUrl: body.tracking_url_provider ?? null,
			labelUrl: body.label_url,
			amountCents: rate ? decimalStringToCents(rate.amount) : 0,
			currency: rate?.currency ?? "USD",
		};
	},

	async voidLabel({ credentials, externalLabelId }): Promise<boolean> {
		try {
			const body = (await shippo(credentials, "/refunds/", {
				method: "POST",
				body: { transaction: externalLabelId, async: false },
			})) as { status?: string };
			// PENDING is a real outcome: the carrier will decide later. Reporting it
			// as success would tell a business money is coming back when it may not.
			return body.status === "SUCCESS";
		} catch {
			// A carrier declining to refund a scanned label is not an error. The
			// parcel is already moving, which is a true answer to "can this be
			// cancelled" rather than a failure to answer it.
			return false;
		}
	},

	/**
	 * 🔴 Shippo signs NOTHING.
	 *
	 * Verified against the live API on 2026-08-22: a created webhook object is
	 * `{active, event, object_id, object_owner, url, is_test}` and carries no
	 * secret of any kind. So the URL itself is the credential — the caller puts
	 * `webhookSecret` in the path and compares it before this is ever reached —
	 * and the payload is then RE-FETCHED from Shippo rather than trusted.
	 *
	 * ⚠️ That re-fetch is not belt and braces. A URL leaks: it sits in logs, in
	 * proxies, in somebody's browser history. Anyone holding it could post a
	 * "delivered" for any tracking number, and a business would stop chasing a
	 * parcel that never arrived. Asking the carrier what it actually says closes
	 * that, and costs one request on an event that arrives a handful of times per
	 * parcel.
	 */
	async verifyWebhook(
		request,
		credentials,
	): Promise<CarrierTrackingUpdate | null> {
		let claimed: {
			event?: string;
			data?: {
				carrier?: string;
				tracking_number?: string;
			};
		};
		try {
			claimed = JSON.parse(request.rawBody);
		} catch {
			return null;
		}

		const carrier = claimed.data?.carrier;
		const trackingNumber = claimed.data?.tracking_number;
		if (claimed.event !== "track_updated" || !carrier || !trackingNumber) {
			return null;
		}

		let truth: unknown;
		try {
			truth = await shippo(
				credentials,
				`/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`,
			);
		} catch {
			// Never say why. A caller who cannot be verified must not learn whether
			// the token is missing, the tracking number wrong, or Shippo down.
			return null;
		}

		const tracked = truth as {
			carrier?: string;
			tracking_number?: string;
			tracking_status?: {
				status?: string;
				status_details?: string | null;
				status_date?: string | null;
			} | null;
		};
		const status = mapTrackingStatus(tracked.tracking_status?.status);
		if (!status) return null;

		return {
			trackingNumber: tracked.tracking_number ?? trackingNumber,
			carrier: tracked.carrier ?? carrier,
			status,
			detail: tracked.tracking_status?.status_details ?? null,
			occurredAt: tracked.tracking_status?.status_date
				? new Date(tracked.tracking_status.status_date)
				: new Date(),
		};
	},
};

/**
 * Shippo's vocabulary, translated into ours.
 *
 * ⚠️ Unknown returns null rather than a guess. A status nobody mapped is a
 * status nobody has decided what to do about, and defaulting it to `in_transit`
 * would quietly mark a returned parcel as on its way.
 */
export function mapTrackingStatus(
	status: string | undefined,
): CarrierTrackingUpdate["status"] | null {
	switch (status) {
		case "TRANSIT":
			return "in_transit";
		case "DELIVERED":
			return "delivered";
		case "FAILURE":
			return "exception";
		case "RETURNED":
			return "returned";
		default:
			// UNKNOWN and PRE_TRANSIT both mean "nothing has happened yet", which is
			// not news and must not become a shipment event.
			return null;
	}
}
