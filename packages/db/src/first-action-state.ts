import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import {
	FIRST_ACTION_CHECKLIST_VERSION,
	resolveFirstActionChecklistState,
} from "./first-action-state-policy";
import { quickdashFirstActionStates } from "./schema/quickengine";

export type SaveFirstActionChecklistStateInput = {
	userId: string;
	workspaceId: string;
	collapsed: boolean;
	dismissed: boolean;
};

export async function getFirstActionChecklistState(
	userId: string,
	workspaceId: string,
) {
	const [stored] = await db
		.select({
			checklistVersion: quickdashFirstActionStates.checklistVersion,
			collapsed: quickdashFirstActionStates.collapsed,
			dismissedAt: quickdashFirstActionStates.dismissedAt,
			completedAt: quickdashFirstActionStates.completedAt,
		})
		.from(quickdashFirstActionStates)
		.where(
			and(
				eq(quickdashFirstActionStates.userId, userId),
				eq(quickdashFirstActionStates.workspaceId, workspaceId),
			),
		)
		.limit(1);

	return {
		...resolveFirstActionChecklistState(stored),
		hasStoredState: stored !== undefined,
	};
}

export async function saveFirstActionChecklistState(
	input: SaveFirstActionChecklistStateInput,
) {
	const now = new Date();
	const dismissedAt = input.dismissed ? now : null;
	const [saved] = await db
		.insert(quickdashFirstActionStates)
		.values({
			userId: input.userId,
			workspaceId: input.workspaceId,
			checklistVersion: FIRST_ACTION_CHECKLIST_VERSION,
			collapsed: input.collapsed,
			dismissedAt,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				quickdashFirstActionStates.userId,
				quickdashFirstActionStates.workspaceId,
			],
			set: {
				checklistVersion: FIRST_ACTION_CHECKLIST_VERSION,
				collapsed: input.collapsed,
				dismissedAt,
				updatedAt: now,
			},
		})
		.returning({
			checklistVersion: quickdashFirstActionStates.checklistVersion,
			collapsed: quickdashFirstActionStates.collapsed,
			dismissedAt: quickdashFirstActionStates.dismissedAt,
			completedAt: quickdashFirstActionStates.completedAt,
		});

	return resolveFirstActionChecklistState(saved);
}

export async function completeFirstActionChecklistState(
	userId: string,
	workspaceId: string,
) {
	const now = new Date();
	const [saved] = await db
		.insert(quickdashFirstActionStates)
		.values({
			userId,
			workspaceId,
			checklistVersion: FIRST_ACTION_CHECKLIST_VERSION,
			collapsed: true,
			dismissedAt: now,
			completedAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				quickdashFirstActionStates.userId,
				quickdashFirstActionStates.workspaceId,
			],
			set: {
				collapsed: true,
				/**
				 * 🔴 An ISO STRING with an explicit cast, never the `Date`.
				 *
				 * Drizzle converts a value assigned straight to a column, but inside
				 * a `sql` template it passes what it is given — and the driver
				 * refuses a `Date`, throwing `The "string" argument must be of type
				 * string ... Received an instance of Date`.
				 *
				 * It only fires the FIRST time someone completes their checklist, and
				 * then never recovers: the failed write leaves `completed_at` null, so
				 * every later page load takes the same branch and throws again. On
				 * 2026-08-29 that turned a real dashboard into a permanent 500 the
				 * moment its owner finished setting up — the worst possible moment.
				 */
				dismissedAt: sql`coalesce(${quickdashFirstActionStates.dismissedAt}, ${now.toISOString()}::timestamptz)`,
				completedAt: sql`coalesce(${quickdashFirstActionStates.completedAt}, ${now.toISOString()}::timestamptz)`,
				updatedAt: now,
			},
		})
		.returning({
			checklistVersion: quickdashFirstActionStates.checklistVersion,
			collapsed: quickdashFirstActionStates.collapsed,
			dismissedAt: quickdashFirstActionStates.dismissedAt,
			completedAt: quickdashFirstActionStates.completedAt,
		});
	return resolveFirstActionChecklistState(saved);
}

export async function resetFirstActionChecklistState(
	userId: string,
	workspaceId: string,
) {
	await db
		.delete(quickdashFirstActionStates)
		.where(
			and(
				eq(quickdashFirstActionStates.userId, userId),
				eq(quickdashFirstActionStates.workspaceId, workspaceId),
			),
		);
}
