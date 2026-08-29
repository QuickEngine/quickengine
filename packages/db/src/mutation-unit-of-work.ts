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

/**
 * Told when a mutation has COMMITTED, so its outbox events can be drained now
 * rather than on the next cron tick.
 *
 * 🔴 A hook rather than an import. The Inngest client lives in
 * `@quickengine/jobs`, and depending on it from here would put a provider SDK in
 * the module graph of route registration and of `openapi.test.ts` — hard rule 12,
 * which has broken CI three times. The API registers the implementation instead.
 *
 * ⚠️ Best effort BY DESIGN. The outbox is the durable record and the every-minute
 * cron still drains it, so a nudge that never arrives costs latency and nothing
 * else. It must never fail a mutation that has already committed, which is why
 * it takes no arguments, returns nothing, and is called after the transaction.
 */
let committedListener: (() => void | Promise<void>) | null = null;

export function onMutationCommitted(
	listener: (() => void | Promise<void>) | null,
): void {
	committedListener = listener;
}

/**
 * ⚠️ AWAITED, and that is the point.
 *
 * The first version called this and moved on, which reads as harmless and is
 * not: on a serverless host the response returns, the instance freezes, and any
 * work still in flight is discarded. Two deploys looked correct and changed
 * nothing because of it. The listener decides whether it needs the wait — it
 * hands off to the platform where it can, and only blocks where it cannot.
 */
async function announceCommit(): Promise<void> {
	if (!committedListener) return;
	try {
		await committedListener();
	} catch {
		// Swallowed deliberately: the work is done and the cron is the backstop.
	}
}

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

		const outcome: MutationResult<TResult> = await db.transaction(
			async (tx) => {
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
				if (!mutation)
					throw new Error("Failed to create mutation ledger entry");

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
							actorId: context.actor.id,
							actorType: context.actor.type,
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
			},
		);

		// After COMMIT, never inside it: a nudge sent from within the transaction
		// would announce work that a rollback then erased.
		if (outcome.kind === "success") await announceCommit();
		return outcome;
	},
};
