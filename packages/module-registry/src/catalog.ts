import { clientRecordsModule } from "@quickengine/mod-client-records/module";
import { fulfillmentModule } from "@quickengine/mod-fulfillment/module";
import { inventoryModule } from "@quickengine/mod-inventory/module";
import { invoicingModule } from "@quickengine/mod-invoicing/module";
import { ordersModule } from "@quickengine/mod-orders/module";
import { paymentsModule } from "@quickengine/mod-payments/module";
import { productsServicesModule } from "@quickengine/mod-products-services/module";
import { shippingModule } from "@quickengine/mod-shipping/module";
import type { ModuleManifest } from "./manifest";

// The catalog of every module QuickDash ships. New module = add its manifest here.
// Typed as ModuleManifest[], so a manifest that doesn't conform fails typecheck.
const ALL_MODULES: readonly ModuleManifest[] = [
	clientRecordsModule,
	invoicingModule,
	paymentsModule,
	fulfillmentModule,
	productsServicesModule,
	ordersModule,
	inventoryModule,
	shippingModule,
];

// Indexed by id for O(1) lookup.
export const MODULE_CATALOG: Readonly<Record<string, ModuleManifest>> =
	Object.freeze(Object.fromEntries(ALL_MODULES.map((m) => [m.id, m])));

/** A module manifest by id, or undefined if no such module exists. */
export function getModule(id: string): ModuleManifest | undefined {
	return MODULE_CATALOG[id];
}

/** Every module in the catalog. */
export function listModules(): readonly ModuleManifest[] {
	return ALL_MODULES;
}
