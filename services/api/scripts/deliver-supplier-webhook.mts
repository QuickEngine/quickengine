/**
 * Deliver a correctly signed supplier fulfilment webhook, locally.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Shopify cannot reach `localhost`. The inbound half of the fulfilment loop
 * therefore cannot be exercised on a developer machine at all — the handler is
 * unreachable, and the only alternative is a tunnel or deploying to find out.
 * The 2026-08-19 rehearsal hit the same wall with Stripe and solved it the same
 * way: sign the payload by hand and post it.
 *
 * ⚠️ It signs with the connection's REAL stored secret and posts to the REAL
 * route, so everything after the signature check is exercised exactly as
 * production would run it. Nothing about verification is stubbed.
 *
 * 🔴 Local databases only.
 *
 * Usage:  pnpm supplier:webhook PO-0004 [tracking-number]
 */
import { createHmac } from "node:crypto";
import { db, eq, purchaseOrders } from "@quickengine/db";
import { resolveSupplierConnection } from "@quickengine/mod-inventory";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
	throw new Error("Refusing to run against a non-local database.");
}

const number = process.argv[2] ?? "PO-0004";
const tracking = process.argv[3] ?? "TRK-REHEARSAL-1";
const apiUrl = process.env.VITE_API_URL ?? "http://localhost:3020";

const [po] = await db
	.select()
	.from(purchaseOrders)
	.where(eq(purchaseOrders.number, number))
	.limit(1);
if (!po) throw new Error(`No purchase order named ${number}`);
if (!po.supplierReference) {
	throw new Error(
		`${number} has no supplier reference — it was never placed, so nothing can report shipping it.`,
	);
}

const connection = await resolveSupplierConnection({
	workspaceId: po.workspaceId,
	supplierId: po.supplierId,
	provider: "shopify",
});
if (!connection) throw new Error("No active connection for that supplier.");
if (!connection.webhookSecret) {
	throw new Error(
		"That connection has no webhook signing secret. Add one with Replace on the supplier, then run this again.",
	);
}

// Shopify reports the order as a NUMBER; the adapter rebuilds the gid from it.
const numericOrderId = po.supplierReference.split("/").pop();

const body = JSON.stringify({
	id: 987654321,
	order_id: Number(numericOrderId),
	status: "success",
	tracking_company: "Canada Post",
	tracking_number: tracking,
	tracking_urls: [`https://www.canadapost-postescanada.ca/track/${tracking}`],
	line_items: [{ sku: "EZPZ-ETH-250", quantity: 1 }],
});

const signature = createHmac("sha256", connection.webhookSecret)
	.update(body, "utf8")
	.digest("base64");

const url = `${apiUrl}/webhooks/supplier/shopify/${po.workspaceId}/${po.supplierId}`;
const response = await fetch(url, {
	method: "POST",
	headers: {
		"content-type": "application/json",
		"x-shopify-topic": "fulfillments/create",
		"x-shopify-hmac-sha256": signature,
		"x-shopify-webhook-id": `rehearsal-${Date.now()}`,
		"x-shopify-shop-domain": connection.shopDomain,
	},
	body,
});

console.log(`POST ${url}`);
console.log(`  → ${response.status} ${await response.text()}`);
process.exit(0);
