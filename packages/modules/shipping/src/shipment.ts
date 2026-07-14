import { z } from "zod";

export const SHIPMENT_STATUSES = [
	"draft",
	"ready",
	"shipped",
	"in_transit",
	"delivered",
	"exception",
	"cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const shippingAddressSchema = z.object({
	recipientName: z.string().trim().min(1).max(160),
	company: z.string().trim().max(160).nullable().default(null),
	line1: z.string().trim().min(1).max(200),
	line2: z.string().trim().max(200).nullable().default(null),
	city: z.string().trim().min(1).max(120),
	region: z.string().trim().max(120).nullable().default(null),
	postalCode: z.string().trim().min(1).max(32).nullable().default(null),
	countryCode: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/),
	phone: z.string().trim().max(40).nullable().default(null),
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email())
		.nullable()
		.default(null),
});
export type ShippingAddress = z.output<typeof shippingAddressSchema>;

export const shipmentLineInputSchema = z.object({
	orderLineItemId: z.uuid(),
	quantity: z.number().int().positive().max(1_000_000),
});
export type ShipmentLineInput = z.output<typeof shipmentLineInputSchema>;

export const shipmentParcelSchema = z
	.object({
		weightGrams: z.number().int().positive().max(1_000_000),
		lengthMillimeters: z
			.number()
			.int()
			.positive()
			.max(100_000)
			.nullable()
			.default(null),
		widthMillimeters: z
			.number()
			.int()
			.positive()
			.max(100_000)
			.nullable()
			.default(null),
		heightMillimeters: z
			.number()
			.int()
			.positive()
			.max(100_000)
			.nullable()
			.default(null),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((parcel, context) => {
		const dimensions = [
			parcel.lengthMillimeters,
			parcel.widthMillimeters,
			parcel.heightMillimeters,
		];
		const supplied = dimensions.filter((value) => value !== null).length;
		if (supplied !== 0 && supplied !== 3) {
			context.addIssue({
				code: "custom",
				message: "Parcel dimensions must be supplied together",
				path: ["lengthMillimeters"],
			});
		}
	});
export type ShipmentParcel = z.output<typeof shipmentParcelSchema>;

export const shipmentInputSchema = z
	.object({
		orderId: z.uuid(),
		lines: z.array(shipmentLineInputSchema).min(1).max(500),
		destination: shippingAddressSchema,
		parcels: z.array(shipmentParcelSchema).min(1).max(50),
		carrier: z.string().trim().max(80).nullable().default(null),
		serviceLevel: z.string().trim().max(120).nullable().default(null),
		trackingNumber: z.string().trim().max(200).nullable().default(null),
		trackingUrl: z.string().trim().pipe(z.url()).nullable().default(null),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((shipment, context) => {
		const lineIds = new Set<string>();
		for (const [index, line] of shipment.lines.entries()) {
			if (lineIds.has(line.orderLineItemId)) {
				context.addIssue({
					code: "custom",
					message: "A shipment cannot repeat an order line",
					path: ["lines", index, "orderLineItemId"],
				});
			}
			lineIds.add(line.orderLineItemId);
		}
	});
export type ShipmentInput = z.input<typeof shipmentInputSchema>;
export type Shipment = z.output<typeof shipmentInputSchema>;

export const shipmentTrackingPatchSchema = z
	.object({
		carrier: z.string().trim().max(80).nullable().optional(),
		serviceLevel: z.string().trim().max(120).nullable().optional(),
		trackingNumber: z.string().trim().max(200).nullable().optional(),
		trackingUrl: z.string().trim().pipe(z.url()).nullable().optional(),
	})
	.strict()
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one tracking field is required",
	});
export type ShipmentTrackingPatch = z.input<typeof shipmentTrackingPatchSchema>;

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> =
	{
		draft: ["ready", "cancelled"],
		ready: ["draft", "shipped", "cancelled"],
		shipped: ["in_transit", "delivered", "exception"],
		in_transit: ["delivered", "exception"],
		delivered: [],
		exception: ["in_transit", "delivered", "cancelled"],
		cancelled: [],
	};

export function canTransitionShipment(
	from: ShipmentStatus,
	to: ShipmentStatus,
): boolean {
	return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function assertShipmentQuantityAllowed(
	orderedQuantity: number,
	alreadyAllocatedQuantity: number,
	requestedQuantity: number,
): void {
	if (alreadyAllocatedQuantity + requestedQuantity > orderedQuantity) {
		throw new Error("ORDER_LINE_OVERSHIPPED");
	}
}
