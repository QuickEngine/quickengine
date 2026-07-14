import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { fulfillments } from "./fulfillments";
import { orderLineItems, orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

export type ShipmentAddressSnapshot = {
	recipientName: string;
	company: string | null;
	line1: string;
	line2: string | null;
	city: string;
	region: string | null;
	postalCode: string | null;
	countryCode: string;
	phone: string | null;
	email: string | null;
};

export const shipments = pgTable(
	"shipments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		orderId: uuid("order_id")
			.notNull()
			.references(() => orders.id),
		fulfillmentId: uuid("fulfillment_id")
			.notNull()
			.references(() => fulfillments.id),
		status: text("status", {
			enum: [
				"draft",
				"ready",
				"shipped",
				"in_transit",
				"delivered",
				"exception",
				"cancelled",
			],
		})
			.notNull()
			.default("draft"),
		destination: jsonb("destination")
			.$type<ShipmentAddressSnapshot>()
			.notNull(),
		carrier: text("carrier"),
		serviceLevel: text("service_level"),
		trackingNumber: text("tracking_number"),
		trackingUrl: text("tracking_url"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		shippedAt: timestamp("shipped_at", { withTimezone: true }),
		inTransitAt: timestamp("in_transit_at", { withTimezone: true }),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("shipments_workspace_idx").on(table.workspaceId),
		index("shipments_order_idx").on(table.orderId),
		index("shipments_workspace_status_idx").on(table.workspaceId, table.status),
		uniqueIndex("shipments_fulfillment_unique").on(table.fulfillmentId),
	],
);

export const shipmentLines = pgTable(
	"shipment_lines",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		shipmentId: uuid("shipment_id")
			.notNull()
			.references(() => shipments.id, { onDelete: "cascade" }),
		orderLineItemId: uuid("order_line_item_id")
			.notNull()
			.references(() => orderLineItems.id),
		quantity: integer("quantity").notNull(),
	},
	(table) => [
		index("shipment_lines_shipment_idx").on(table.shipmentId),
		index("shipment_lines_order_line_idx").on(table.orderLineItemId),
		uniqueIndex("shipment_lines_target_unique").on(
			table.shipmentId,
			table.orderLineItemId,
		),
	],
);

export const shipmentParcels = pgTable(
	"shipment_parcels",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		shipmentId: uuid("shipment_id")
			.notNull()
			.references(() => shipments.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		weightGrams: integer("weight_grams").notNull(),
		lengthMillimeters: integer("length_millimeters"),
		widthMillimeters: integer("width_millimeters"),
		heightMillimeters: integer("height_millimeters"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(table) => [index("shipment_parcels_shipment_idx").on(table.shipmentId)],
);
