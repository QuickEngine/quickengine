import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	and,
	asc,
	db,
	eq,
	fulfillments,
	gt,
	mutationUnitOfWork,
} from "@quickengine/db";
import { z } from "zod";
import {
	type CreateFulfillmentInput,
	createFulfillment,
	setFulfillmentStatus,
} from "./fulfillments";
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from "./status";

export type FulfillmentMutationUnitOfWork =
	MutationUnitOfWork<DatabaseTransaction>;

export const fulfillmentListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(FULFILLMENT_STATUSES).optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CLIENT_NOT_FOUND: "The client on this delivery was not found.",
	CLIENT_INVOICE_MISMATCH:
		"That client doesn't match the client on the linked invoice.",
	INVOICE_NOT_FOUND: "The linked invoice was not found.",
	INVOICE_NOT_PAID: "A delivery can only be linked to a paid invoice.",
	PAYMENT_NOT_FOUND: "The linked payment was not found.",
	PAYMENT_NOT_SUCCEEDED:
		"A delivery can only be linked to a succeeded payment.",
	PAYMENT_INVOICE_MISMATCH:
		"That payment belongs to a different invoice than the one linked here.",
	FULFILLMENT_SOURCE_EXISTS:
		"That record already has a delivery. Open the existing one instead.",
	FULFILLMENT_NOT_FOUND: "The delivery was not found.",
	FULFILLMENT_STATUS_UNCHANGED: "The delivery is already in that status.",
	FULFILLMENT_ILLEGAL_TRANSITION: "That delivery status change isn't allowed.",
	FULFILLMENT_CONCURRENT_UPDATE:
		"The delivery changed while this update was in flight. Try again.",
	FULFILLMENT_NOT_DELETABLE:
		"Only a pending delivery can be deleted. Cancel it instead.",
};

function mapFulfillmentError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/MISMATCH/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(NOT_PAID|NOT_SUCCEEDED|SOURCE_EXISTS|UNCHANGED|ILLEGAL_TRANSITION|CONCURRENT_UPDATE|NOT_DELETABLE)/.test(
				error.message,
			)
		) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

function serializeDates<T extends Record<string, unknown>>(
	row: T,
): { [K in keyof T]: T[K] extends Date ? string : T[K] } {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value instanceof Date ? value.toISOString() : value,
		]),
	) as { [K in keyof T]: T[K] extends Date ? string : T[K] };
}

const serializeFulfillment = (row: typeof fulfillments.$inferSelect) =>
	serializeDates(row);

export type FulfillmentDto = ReturnType<typeof serializeFulfillment>;

export async function listFulfillmentsPage(
	workspaceId: string,
	query: { cursor?: string; limit?: number | string; status?: string },
) {
	const page = fulfillmentListQuerySchema.parse(query);
	const where = and(
		eq(fulfillments.workspaceId, workspaceId),
		page.cursor ? gt(fulfillments.id, page.cursor) : undefined,
		page.status ? eq(fulfillments.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(fulfillments)
		.where(where)
		.orderBy(asc(fulfillments.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeFulfillment),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
}

export async function getFulfillmentDto(workspaceId: string, id: string) {
	const [fulfillment] = await db
		.select()
		.from(fulfillments)
		.where(
			and(eq(fulfillments.workspaceId, workspaceId), eq(fulfillments.id, id)),
		)
		.limit(1);
	return fulfillment ? serializeFulfillment(fulfillment) : null;
}

export function createFulfillmentCommand(
	context: MutationExecutionContext,
	input: CreateFulfillmentInput,
	uow: FulfillmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FulfillmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createFulfillment(
				context.workspaceId,
				input,
				transaction.db,
			);
			await transaction.audit({
				action: "fulfillment.created",
				resourceId: row.id,
				resourceType: "fulfillment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "fulfillment",
				eventName: "fulfillment.created",
				payload: { fulfillmentId: row.id },
				version: 1,
			});
			return { result: serializeFulfillment(row), status: 201 };
		})
		.catch(mapFulfillmentError);
}

export function setFulfillmentStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: FulfillmentStatus,
	uow: FulfillmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FulfillmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setFulfillmentStatus(
				context.workspaceId,
				id,
				status,
				transaction.db,
			);
			await transaction.audit({
				action: "fulfillment.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "fulfillment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "fulfillment",
				eventName: "fulfillment.status-changed",
				payload: { fulfillmentId: row.id, status },
				version: 1,
			});
			return { result: serializeFulfillment(row), status: 200 };
		})
		.catch(mapFulfillmentError);
}

export function deleteFulfillmentCommand(
	context: MutationExecutionContext,
	id: string,
	uow: FulfillmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			// The module's delete filters on `status = pending`, so a missing row and a
			// non-pending row look identical. Read under a lock first to tell a caller
			// which of the two actually happened.
			const [current] = await transaction.db
				.select({ status: fulfillments.status })
				.from(fulfillments)
				.where(
					and(
						eq(fulfillments.workspaceId, context.workspaceId),
						eq(fulfillments.id, id),
					),
				)
				.limit(1)
				.for("update");
			if (!current) throw new Error("FULFILLMENT_NOT_FOUND");
			if (current.status !== "pending")
				throw new Error("FULFILLMENT_NOT_DELETABLE");

			const [deleted] = await transaction.db
				.delete(fulfillments)
				.where(
					and(
						eq(fulfillments.workspaceId, context.workspaceId),
						eq(fulfillments.id, id),
					),
				)
				.returning({ id: fulfillments.id });
			if (!deleted) throw new Error("FULFILLMENT_NOT_FOUND");

			await transaction.audit({
				action: "fulfillment.deleted",
				resourceId: deleted.id,
				resourceType: "fulfillment",
			});
			await transaction.outbox({
				aggregateId: deleted.id,
				aggregateType: "fulfillment",
				eventName: "fulfillment.deleted",
				payload: { fulfillmentId: deleted.id },
				version: 1,
			});
			return { result: { id: deleted.id }, status: 200 };
		})
		.catch(mapFulfillmentError);
}
