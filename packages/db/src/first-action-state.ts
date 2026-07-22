import { and, eq } from "drizzle-orm";
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
		})
		.from(quickdashFirstActionStates)
		.where(
			and(
				eq(quickdashFirstActionStates.userId, userId),
				eq(quickdashFirstActionStates.workspaceId, workspaceId),
			),
		)
		.limit(1);

	return resolveFirstActionChecklistState(stored);
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
