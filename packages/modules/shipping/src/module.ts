import { z } from "zod";

/**
 * Where parcels are sent FROM.
 *
 * 🔴 A carrier cannot price a parcel without an origin. This replaced
 * `defaultOriginCountry`, which held a two-letter country code, had no
 * production caller anywhere, and could never have priced anything: a country
 * is not an address, and no carrier quotes from one.
 *
 * ⚠️ Nullable, and that is not laziness. Plenty of businesses price delivery
 * from their own flat-rate bands and never call a carrier at all, and forcing
 * them to type a warehouse address to save an unrelated setting is a tax on
 * people this feature does not serve. The carrier path refuses when it is
 * missing, which is something somebody can read and fix.
 */
export const shippingOriginSchema = z.object({
	/** The name on the label. Usually the business, not a person. */
	name: z.string().trim().min(1).max(160),
	line1: z.string().trim().min(1).max(200),
	line2: z.string().trim().max(200).nullable().default(null),
	city: z.string().trim().min(1).max(120),
	/**
	 * Province or state in the carrier's short form: "AB", "ON", "CA".
	 *
	 * Nullable because plenty of countries have no such division, and inventing
	 * one for them produces addresses the carrier rejects.
	 */
	region: z.string().trim().max(80).nullable().default(null),
	postalCode: z.string().trim().min(1).max(32),
	/** ISO 3166-1 alpha-2. */
	countryCode: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/),
	/**
	 * ⚠️ Required by more carriers than you would expect, and the failure is
	 * LATE: the rate quotes fine and the label purchase is rejected, after the
	 * customer has paid and chosen a service.
	 */
	phone: z.string().trim().max(40).nullable().default(null),
});

export type ShippingOrigin = z.infer<typeof shippingOriginSchema>;

/**
 * The box this business usually ships in.
 *
 * 🔴 A carrier cannot price a parcel without dimensions, and `catalog_items`
 * carries WEIGHT ONLY — no length, width or height anywhere in the system. So
 * live rates need a box from somewhere, and the honest smallest answer is the
 * one the business actually uses: most small shops have one or two.
 *
 * ⚠️ Deliberately not per item, yet. Per-item dimensions plus a packing
 * algorithm is a real feature, and shipping a guess at one would price parcels
 * wrongly in a way nobody could see. One declared box is a number the merchant
 * chose and can check against their own shelf.
 */
export const shippingParcelSchema = z.object({
	lengthMm: z.number().int().min(1).max(3_000),
	widthMm: z.number().int().min(1).max(3_000),
	heightMm: z.number().int().min(1).max(3_000),
});

export type ShippingParcelSize = z.infer<typeof shippingParcelSchema>;

export const shippingSettingsSchema = z.object({
	origin: shippingOriginSchema.nullable().default(null),
	/** Required before any zone may ask a carrier for prices. */
	defaultParcel: shippingParcelSchema.nullable().default(null),
	defaultCarrier: z.string().trim().max(80).nullable().default(null),
	requireTracking: z.boolean().default(false),
});

export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

export const shippingModule = {
	id: "shipping",
	name: "Shipping",
	description: "Ship physical order items in one or more tracked deliveries.",
	kind: "domain",
	dependsOn: ["orders"] as const,
	// Recording delivery is a business outcome. Carrier labels/rates are a separate
	// infrastructure integration and can be metered when that boundary is built.
	meteredAction: null,
	settingsSchema: shippingSettingsSchema,
	defaultSettings: shippingSettingsSchema.parse({}),
	firstActions: [
		{
			id: "shipping:create",
			version: 1,
			label: "Create your first shipment",
			description: "Prepare a tracked delivery for an order.",
			moduleId: "shipping",
			intent: "create",
			priority: 60,
			requires: ["orders:create"],
			steps: [
				{
					id: "shipping:create:shipment",
					version: 1,
					label: "Prepare the shipment",
					description:
						"Choose the order lines, carrier, parcels, and destination.",
					intent: "create",
				},
				{
					id: "shipping:create:dispatch",
					version: 1,
					label: "Mark it shipped",
					description: "Confirm dispatch and add tracking when available.",
					intent: "dispatch",
				},
			],
		},
	] as const,
} as const;
