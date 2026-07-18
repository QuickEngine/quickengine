import {
	listCatalogItems,
	listProductVariants,
	productsServicesSettingsSchema,
} from "@quickengine/mod-products-services";
import { CatalogView } from "../_components/catalog-view";
import type { ModulePageProps } from "./types";

export default async function CatalogPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const catalogSettings = productsServicesSettingsSchema.parse(settings);
	const catalogRows = await listCatalogItems(workspaceId);
	const catalogVariants = await Promise.all(
		catalogRows.map((item) => listProductVariants(workspaceId, item.id)),
	);
	return (
		<CatalogView
			workspaceId={workspaceId}
			defaultCurrency={catalogSettings.defaultCurrency}
			productLabel={catalogSettings.productLabelPlural}
			serviceLabel={catalogSettings.serviceLabelPlural}
			items={catalogRows.map((item, index) => ({
				id: item.id,
				name: item.name,
				description: item.description,
				type: item.type,
				status: item.status,
				sku: item.sku,
				pricingModel: item.pricingModel,
				priceCents: item.priceCents,
				currency: item.currency,
				unitLabel: item.unitLabel,
				variants:
					catalogVariants[index]?.map((variant) => ({
						id: variant.id,
						options: variant.options,
						status: variant.status,
						sku: variant.sku,
						priceCentsOverride: variant.priceCentsOverride,
					})) ?? [],
			}))}
		/>
	);
}
