import {
	inventorySettingsSchema,
	listInventoryAdjustments,
	listInventoryItems,
} from "@quickengine/mod-inventory";
import {
	listCatalogItems,
	listProductVariants,
} from "@quickengine/mod-products-services";
import { InventoryView } from "../_components/inventory-view";
import type { ModulePageProps } from "./types";

export default async function InventoryPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const inventorySettings = inventorySettingsSchema.parse(settings);
	const inventoryRows = await listInventoryItems(workspaceId);
	const inventoryMovements = await Promise.all(
		inventoryRows.map((item) => listInventoryAdjustments(workspaceId, item.id)),
	);
	const inventoryCatalog = await listCatalogItems(workspaceId);
	const inventoryVariants = await Promise.all(
		inventoryCatalog.map((item) => listProductVariants(workspaceId, item.id)),
	);
	return (
		<InventoryView
			workspaceId={workspaceId}
			defaultThreshold={inventorySettings.defaultLowStockThreshold}
			targets={inventoryCatalog.flatMap((item, index) => {
				if (item.status !== "active") return [];
				const trackedBase = inventoryRows.some(
					(row) =>
						row.catalogItemId === item.id && row.catalogItemVariantId === null,
				);
				const base = trackedBase
					? []
					: [
							{
								value: `${item.id}::`,
								label: item.name,
								sku: item.sku,
							},
						];
				const variants = (inventoryVariants[index] ?? [])
					.filter(
						(variant) =>
							variant.status === "active" &&
							!inventoryRows.some(
								(row) => row.catalogItemVariantId === variant.id,
							),
					)
					.map((variant) => ({
						value: `${item.id}::${variant.id}`,
						label: `${item.name} — ${variant.options
							.map((option) => `${option.name}: ${option.value}`)
							.join(" / ")}`,
						sku: variant.sku ?? item.sku,
					}));
				return [...base, ...variants];
			})}
			items={inventoryRows.map((row, index) => {
				const item = inventoryCatalog.find(
					(catalogItem) => catalogItem.id === row.catalogItemId,
				);
				const variant = inventoryVariants
					.flat()
					.find(
						(catalogVariant) => catalogVariant.id === row.catalogItemVariantId,
					);
				return {
					id: row.id,
					catalogItemId: row.catalogItemId,
					catalogItemVariantId: row.catalogItemVariantId,
					label: variant
						? `${item?.name ?? "Catalog item"} — ${variant.options
								.map((option) => `${option.name}: ${option.value}`)
								.join(" / ")}`
						: (item?.name ?? "Archived catalog target"),
					sku: variant?.sku ?? item?.sku ?? null,
					status: row.status,
					onHand: row.onHand,
					reserved: row.reserved,
					available: row.onHand - row.reserved,
					lowStockThreshold: row.lowStockThreshold,
					movements: (inventoryMovements[index] ?? []).map((movement) => ({
						id: movement.id,
						kind: movement.kind,
						quantity: movement.quantity,
						onHandDelta: movement.onHandDelta,
						reservedDelta: movement.reservedDelta,
						resultingOnHand: movement.resultingOnHand,
						resultingReserved: movement.resultingReserved,
						note: movement.note,
						createdAt: movement.createdAt.toISOString(),
					})),
				};
			})}
		/>
	);
}
