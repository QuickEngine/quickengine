import type {
	AuditIntent,
	MutationCommit,
	MutationExecutionContext,
	MutationResult,
	MutationTransaction,
	MutationUnitOfWork,
	OutboxIntent,
} from "@quickengine/api-contracts/mutations";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { apiAuditEvents, apiMutations, apiOutboxEvents } from "./schema";

export type DatabaseTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

export const mutationUnitOfWork: MutationUnitOfWork<DatabaseTransaction> = {
	async execute<TResult>(
		context: MutationExecutionContext,
		work: (
			transaction: MutationTransaction<DatabaseTransaction>,
		) => Promise<MutationCommit<TResult>>,
	): Promise<MutationResult<TResult>> {
		context.abortSignal.throwIfAborted();
		if (Date.now() >= context.deadlineAtMs) {
			throw new DOMException("Mutation deadline exceeded", "TimeoutError");
		}

		return db.transaction(async (tx) => {
			await tx.execute(sql`set local lock_timeout = '5s'`);
			await tx.execute(sql`set local statement_timeout = '30s'`);
			const lockIdentity = `${context.workspaceId}:${context.operation}:${context.idempotencyKey}`;
			const lockResult = await tx.execute<{ acquired: boolean }>(
				sql`select pg_try_advisory_xact_lock(hashtextextended(${lockIdentity}, 0)) as acquired`,
			);
			if (!lockResult[0]?.acquired) {
				return { kind: "in_progress", retryAfterSeconds: 1 };
			}

			const [existing] = await tx
				.select()
				.from(apiMutations)
				.where(
					and(
						eq(apiMutations.workspaceId, context.workspaceId),
						eq(apiMutations.operation, context.operation),
						eq(apiMutations.idempotencyKey, context.idempotencyKey),
					),
				)
				.limit(1);
			if (existing) {
				if (existing.fingerprint !== context.fingerprint)
					return { kind: "conflict" };
				if (
					existing.state === "completed" &&
					existing.responseStatus !== null
				) {
					return {
						kind: "success",
						result: existing.responseBody as TResult,
						source: "replayed",
						status: existing.responseStatus,
					};
				}
				return { kind: "in_progress", retryAfterSeconds: 1 };
			}

			const [mutation] = await tx
				.insert(apiMutations)
				.values({
					actorId: context.actor.id,
					actorType: context.actor.type,
					fingerprint: context.fingerprint,
					idempotencyKey: context.idempotencyKey,
					operation: context.operation,
					organizationId: context.organizationId,
					requestId: context.requestId,
					source: context.source,
					workspaceId: context.workspaceId,
				})
				.returning({ id: apiMutations.id });
			if (!mutation) throw new Error("Failed to create mutation ledger entry");

			const result = await work({
				db: tx,
				async audit(intent: AuditIntent) {
					await tx.insert(apiAuditEvents).values({
						action: intent.action,
						actorId: context.actor.id,
						actorType: context.actor.type,
						metadata: intent.metadata ?? {},
						organizationId: context.organizationId,
						requestId: context.requestId,
						resourceId: intent.resourceId,
						resourceType: intent.resourceType,
						source: context.source,
						workspaceId: context.workspaceId,
					});
				},
				async outbox(intent: OutboxIntent) {
					await tx.insert(apiOutboxEvents).values({
						aggregateId: intent.aggregateId,
						aggregateType: intent.aggregateType,
						eventName: intent.eventName,
						payload: intent.payload,
						requestId: context.requestId,
						version: intent.version,
						workspaceId: context.workspaceId,
					});
				},
			});

			await tx
				.update(apiMutations)
				.set({
					completedAt: new Date(),
					responseBody: result.result,
					responseStatus: result.status,
					state: "completed",
					updatedAt: new Date(),
				})
				.where(eq(apiMutations.id, mutation.id));
			return {
				kind: "success",
				result: result.result,
				source: "executed",
				status: result.status,
			};
		});
	},
};
