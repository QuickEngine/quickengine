import { and, eq } from "drizzle-orm";
import { db } from "./client";
import {
	QUICKDASH_ORIENTATION_VERSION,
	type QuickDashOrientationOutcome,
	shouldOfferQuickDashOrientation,
} from "./orientation-state-policy";
import { quickdashOrientationStates } from "./schema/orientation";

export async function getQuickDashOrientationState(
	userId: string,
	workspaceId: string,
) {
	const [stored] = await db
		.select({
			orientationVersion: quickdashOrientationStates.orientationVersion,
			outcome: quickdashOrientationStates.outcome,
		})
		.from(quickdashOrientationStates)
		.where(
			and(
				eq(quickdashOrientationStates.userId, userId),
				eq(quickdashOrientationStates.workspaceId, workspaceId),
			),
		)
		.limit(1);

	return { shouldOffer: shouldOfferQuickDashOrientation(stored) };
}

export async function saveQuickDashOrientationOutcome(input: {
	userId: string;
	workspaceId: string;
	outcome: QuickDashOrientationOutcome;
}) {
	const now = new Date();
	await db
		.insert(quickdashOrientationStates)
		.values({
			...input,
			orientationVersion: QUICKDASH_ORIENTATION_VERSION,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				quickdashOrientationStates.userId,
				quickdashOrientationStates.workspaceId,
			],
			set: {
				orientationVersion: QUICKDASH_ORIENTATION_VERSION,
				outcome: input.outcome,
				updatedAt: now,
			},
		});
}

export async function restartQuickDashOrientation(
	userId: string,
	workspaceId: string,
) {
	await db
		.delete(quickdashOrientationStates)
		.where(
			and(
				eq(quickdashOrientationStates.userId, userId),
				eq(quickdashOrientationStates.workspaceId, workspaceId),
			),
		);
}
