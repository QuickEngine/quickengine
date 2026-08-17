import { db } from "./client";
import { apiOutboxEvents } from "./schema/api-platform";

/**
 * Publish one event outside a mutation transaction.
 *
 * ⚠️ NOT the normal path. Domain writes go through the mutation unit of work,
 * which commits the change and its event TOGETHER — so an event can never
 * describe something that did not happen, and a change can never happen
 * silently.
 *
 * This exists for writes that predate that machinery and do not run inside a
 * transaction at all. The cost is real and worth naming: if the process dies
 * between the write and this call, the change happened and nothing was
 * announced. Acceptable for a notification; NOT acceptable for money, which is
 * why nothing on the payment path may use it.
 */
export async function recordOutboxEvent(input: {
	workspaceId: string;
	aggregateType: string;
	aggregateId: string;
	eventName: string;
	payload: Record<string, unknown>;
	requestId: string;
	actorId?: string | null;
	actorType?: string | null;
}): Promise<void> {
	await db.insert(apiOutboxEvents).values({
		workspaceId: input.workspaceId,
		aggregateType: input.aggregateType,
		aggregateId: input.aggregateId,
		eventName: input.eventName,
		payload: input.payload,
		requestId: input.requestId,
		actorId: input.actorId ?? null,
		actorType: input.actorType ?? null,
		version: 1,
	});
}
