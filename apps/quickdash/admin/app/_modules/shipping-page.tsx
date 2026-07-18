import { getOrder, listOrders } from "@quickengine/mod-orders";
import {
	getShipment,
	listShipments,
	shippingSettingsSchema,
} from "@quickengine/mod-shipping";
import { ShippingView } from "../_components/shipping-view";
import type { ModulePageProps } from "./types";

export default async function ShippingPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const shippingSettings = shippingSettingsSchema.parse(settings);
	const shipmentRows = await listShipments(workspaceId);
	const shipmentDetails = await Promise.all(
		shipmentRows.map((shipment) => getShipment(workspaceId, shipment.id)),
	);
	const shippingOrderRows = await listOrders(workspaceId);
	const shippingOrders = await Promise.all(
		shippingOrderRows.map((order) => getOrder(workspaceId, order.id)),
	);
	return (
		<ShippingView
			workspaceId={workspaceId}
			defaultCountry={shippingSettings.defaultOriginCountry}
			defaultCarrier={shippingSettings.defaultCarrier}
			shippableLines={shippingOrders.flatMap((order) => {
				if (
					!order ||
					(order.status !== "confirmed" && order.status !== "processing")
				)
					return [];
				return order.lines.flatMap((line) => {
					if (line.type !== "physical" && line.type !== "rental") return [];
					const allocated = shipmentDetails.reduce((total, shipment) => {
						if (!shipment || shipment.status === "cancelled") return total;
						return (
							total +
							shipment.lines
								.filter((item) => item.orderLineItemId === line.id)
								.reduce((sum, item) => sum + item.quantity, 0)
						);
					}, 0);
					const remaining = line.quantity - allocated;
					return remaining > 0
						? [
								{
									orderId: order.id,
									orderNumber: order.number,
									lineId: line.id,
									label: line.sku ? `${line.name} (${line.sku})` : line.name,
									remaining,
									recipientName: order.clientName,
									recipientEmail: order.clientEmail,
								},
							]
						: [];
				});
			})}
			shipments={shipmentDetails.flatMap((shipment) => {
				if (!shipment) return [];
				const order = shippingOrders.find(
					(candidate) => candidate?.id === shipment.orderId,
				);
				return [
					{
						id: shipment.id,
						orderNumber: order?.number ?? "Archived order",
						status: shipment.status,
						destination: shipment.destination,
						carrier: shipment.carrier,
						serviceLevel: shipment.serviceLevel,
						trackingNumber: shipment.trackingNumber,
						trackingUrl: shipment.trackingUrl,
						createdAt: shipment.createdAt.toISOString(),
						lines: shipment.lines.map((shipmentLine) => ({
							label:
								order?.lines.find(
									(line) => line.id === shipmentLine.orderLineItemId,
								)?.name ?? "Archived order line",
							quantity: shipmentLine.quantity,
						})),
						parcels: shipment.parcels.map((parcel) => ({
							weightGrams: parcel.weightGrams,
						})),
					},
				];
			})}
		/>
	);
}
