import { db, productEvents } from "@quickengine/db";
import { type ProductEventInput, stripUnsafe } from "./events";

/**
 * Record one product event.
 *
 * 🔴 **Never throws, ever.** Telemetry that can fail a request is worse than no
 * telemetry: it turns a reporting outage into a product outage, and the first
 * time it happens somebody rips the instrumentation out rather than debug it.
 * A lost event costs a gap in a chart.
 *
 * Not a durable mutation, for the same reason `/v1/events` is not: these are
 * high-frequency writes of no business meaning, and routing them through the
 * unit of work would triple the writes and fill the audit trail with records
 * nobody will ever read.
 *
 * ⚠️ Properties pass through `stripUnsafe`, which drops anything whose key
 * reads like content rather than a dimension. That is a backstop, not
 * permission — the contract in `events.ts` is what authors should follow.
 */
export async function recordProductEvent(
	input: ProductEventInput,
): Promise<void> {
	try {
		const { safe } = stripUnsafe(input.properties);
		await db.insert(productEvents).values({
			name: input.name,
			surface: input.surface,
			userId: input.userId ?? null,
			organizationId: input.organizationId ?? null,
			workspaceId: input.workspaceId ?? null,
			properties: safe,
		});
	} catch {
		// See above. A missing event is a gap in a chart; a thrown one is an outage.
	}
}

/**
 * Fire and forget.
 *
 * For request paths where even the round trip is not worth waiting on. The
 * promise is deliberately not returned, so an `await` cannot be added later by
 * someone who assumes it is free.
 */
export function trackProductEvent(input: ProductEventInput): void {
	void recordProductEvent(input);
}
