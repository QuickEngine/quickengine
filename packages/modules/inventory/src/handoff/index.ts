import type {
	SupplierFulfilmentAdapter,
	SupplierHandoffMethod,
} from "./provider";
import { shopifySupplierAdapter } from "./shopify";

/**
 * Which supplier handoffs are automated.
 *
 * Adding WooCommerce, a supplier's own API or a CSV drop means writing one file
 * next to `shopify.ts` and adding a line here. Nothing above the seam changes —
 * that is the entire point of `provider.ts`.
 *
 * ⚠️ `email`, `manual`, `portal` and `unknown` are deliberately absent, for the
 * same reason `manual` is absent from the payments registry. An email handoff is
 * a mail send performed by `supplier-handoff.ts`; a manual one is a human. There
 * is nothing for either to implement, and giving them a stub would invite code
 * to call `placeOrder` on a supplier that only ever receives a plain email.
 *
 * 🔴 Populated as adapters land. Empty is a valid state and must stay valid:
 * `isAutomatedHandoff` is what callers branch on, so an unbuilt adapter leaves a
 * purchase order sitting in `draft` for a human rather than throwing.
 */
const ADAPTERS: Partial<
	Record<SupplierHandoffMethod, SupplierFulfilmentAdapter>
> = {
	shopify: shopifySupplierAdapter,
};

export class UnsupportedHandoffMethodError extends Error {
	constructor(readonly method: string) {
		super(`No supplier integration is configured for "${method}".`);
	}
}

/**
 * The adapter for a handoff method, or a thrown error naming it.
 *
 * Throws rather than returning null because every caller is about to commit a
 * business to buying stock. Silently continuing with no adapter is the failure
 * where a purchase order is marked sent and no supplier ever heard of it.
 *
 * ⚠️ Guard with `isAutomatedHandoff` first. This is not the check for "should
 * this be automated" — it is the lookup once that has been decided.
 */
export function getSupplierAdapter(method: string): SupplierFulfilmentAdapter {
	const found = ADAPTERS[method as SupplierHandoffMethod];
	if (!found) throw new UnsupportedHandoffMethodError(method);
	return found;
}

/** Whether a handoff is placed through an adapter, as opposed to emailed or done by hand. */
export function isAutomatedHandoff(method: string): boolean {
	return method in ADAPTERS;
}

export type {
	SupplierConnection,
	SupplierConnectionCheck,
	SupplierFulfilmentAdapter,
	SupplierHandoffMethod,
	SupplierOrderLine,
	SupplierOrderPlacement,
	SupplierOrderRequest,
	SupplierShipmentNotice,
	SupplierShipTo,
	VerifiedSupplierEvent,
} from "./provider";
export { createShopifyAdapter, shopifySupplierAdapter } from "./shopify";
