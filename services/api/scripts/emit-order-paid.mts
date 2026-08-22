/**
 * Emit `order.paid` for an existing order, locally.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * `order.paid` is only ever written by provider-confirmed settlement — a real
 * Stripe or PayPal webhook. That path is already proven with real money, and
 * standing it up again is not what a supplier-rail rehearsal is testing.
 *
 * This writes the same event settlement writes, so everything DOWNSTREAM runs
 * for real: purchase orders raised per supplier, the handoff dispatched through
 * the adapter, and a genuine order placed in the supplier's system.
 *
 * ⚠️ It stubs the PAYMENT, not the rail. Nothing here fakes a supplier call.
 *
 * 🔴 Local databases only. Pointed at production this would place real supplier
 * orders for goods nobody paid for.
 *
 * Usage:  pnpm order:paid ORD-0001
 */
import { apiOutboxEvents, db, orders } from "@quickengine/db";
import { eq } from "drizzle-orm";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
	throw new Error(
		"Refusing to emit order.paid against a non-local database. This places real supplier orders.",
	);
}

const number = process.argv[2];
if (!number) throw new Error("Usage: pnpm order:paid ORD-0001");

const [order] = await db
	.select({
		id: orders.id,
		workspaceId: orders.workspaceId,
		number: orders.number,
		status: orders.status,
	})
	.from(orders)
	.where(eq(orders.number, number))
	.limit(1);

if (!order) throw new Error(`No order named ${number}`);

await db.insert(apiOutboxEvents).values({
	workspaceId: order.workspaceId,
	aggregateType: "order",
	aggregateId: order.id,
	eventName: "order.paid",
	payload: { orderId: order.id, rehearsal: true },
	version: 1,
	requestId: `rehearsal-${Date.now()}`,
	actorType: "system",
	actorId: "rehearsal",
});

console.log(
	`order.paid queued for ${order.number} (${order.status}). The drain will pick it up.`,
);
process.exit(0);
