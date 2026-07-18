import { listClientRecords } from "@quickengine/mod-client-records";
import {
	getOrder,
	listOrders,
	ordersSettingsSchema,
} from "@quickengine/mod-orders";
import {
	listCatalogItems,
	listProductVariants,
} from "@quickengine/mod-products-services";
import { OrdersView } from "../_components/orders-view";
import type { ModulePageProps } from "./types";

export default async function OrdersPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const orderSettings = ordersSettingsSchema.parse(settings);
	const orderRows = await listOrders(workspaceId);
	const orderDetails = await Promise.all(
		orderRows.map((order) => getOrder(workspaceId, order.id)),
	);
	const orderClients = await listClientRecords(workspaceId);
	const orderCatalog = (await listCatalogItems(workspaceId, "active")).filter(
		(item) => item.currency === orderSettings.defaultCurrency,
	);
	const orderCatalogVariants = await Promise.all(
		orderCatalog.map((item) => listProductVariants(workspaceId, item.id)),
	);
	return (
		<OrdersView
			workspaceId={workspaceId}
			defaultCurrency={orderSettings.defaultCurrency}
			clients={orderClients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			catalog={orderCatalog.flatMap((item, index) => {
				const base = {
					value: `${item.id}::`,
					label: item.name,
					priceCents: item.priceCents,
					currency: item.currency,
					type: item.type,
					sku: item.sku,
				};
				const variants = (orderCatalogVariants[index] ?? [])
					.filter((variant) => variant.status === "active")
					.map((variant) => ({
						value: `${item.id}::${variant.id}`,
						label: `${item.name} — ${variant.options
							.map((option) => `${option.name}: ${option.value}`)
							.join(" / ")}`,
						priceCents: variant.priceCentsOverride ?? item.priceCents,
						currency: item.currency,
						type: item.type,
						sku: variant.sku ?? item.sku,
					}));
				return [base, ...variants];
			})}
			orders={orderDetails.flatMap((order) =>
				order
					? [
							{
								id: order.id,
								number: order.number,
								status: order.status,
								clientId: order.clientId,
								clientName: order.clientName,
								clientEmail: order.clientEmail,
								currency: order.currency,
								totalCents: order.totalCents,
								notes: order.notes,
								fulfillmentId: order.fulfillmentId,
								createdAt: order.createdAt.toISOString(),
								lines: order.lines.map((line) => ({
									id: line.id,
									catalogItemId: line.catalogItemId,
									catalogItemVariantId: line.catalogItemVariantId,
									name: line.name,
									type: line.type,
									sku: line.sku,
									quantity: line.quantity,
									unitPriceCents: line.unitPriceCents,
									lineTotalCents: line.lineTotalCents,
									variantOptions: line.variantOptions,
								})),
							},
						]
					: [],
			)}
		/>
	);
}
