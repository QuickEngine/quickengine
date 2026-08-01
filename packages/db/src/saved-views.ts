import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { savedViews } from "./schema/saved-views";

export type SavedView = {
	id: string;
	moduleId: string;
	name: string;
	state: Record<string, unknown>;
	pinned: boolean;
	position: number;
};

/** Who a view belongs to. Both parts are required — a view is personal. */
export type SavedViewOwner = {
	workspaceId: string;
	userId: string;
};

const MAX_VIEWS_PER_MODULE = 50;

const toDto = (row: typeof savedViews.$inferSelect): SavedView => ({
	id: row.id,
	moduleId: row.moduleId,
	name: row.name,
	state: row.state,
	pinned: row.pinned,
	position: row.position,
});

/** One person's views for one module, in their order. */
export async function listSavedViews(
	owner: SavedViewOwner,
	moduleId: string,
): Promise<SavedView[]> {
	const rows = await db
		.select()
		.from(savedViews)
		.where(
			and(
				eq(savedViews.workspaceId, owner.workspaceId),
				eq(savedViews.userId, owner.userId),
				eq(savedViews.moduleId, moduleId),
			),
		)
		.orderBy(asc(savedViews.position), asc(savedViews.createdAt));
	return rows.map(toDto);
}

/**
 * Everything this person pinned, across every module.
 *
 * QuickDash Home reads this. Deliberately not filtered by module — the point of
 * pinning is to see today's work without choosing where to look first.
 */
export async function listPinnedSavedViews(
	owner: SavedViewOwner,
): Promise<SavedView[]> {
	const rows = await db
		.select()
		.from(savedViews)
		.where(
			and(
				eq(savedViews.workspaceId, owner.workspaceId),
				eq(savedViews.userId, owner.userId),
				eq(savedViews.pinned, true),
			),
		)
		.orderBy(asc(savedViews.position), asc(savedViews.createdAt));
	return rows.map(toDto);
}

/**
 * Create a view, or update the one that already has this name.
 *
 * **Upsert rather than reject.** "Save this view" pressed twice with the same
 * name means "update it" to everybody who has ever used a spreadsheet. The
 * unique index makes the intent unambiguous and the conflict clause makes it
 * behave the way people expect instead of erroring.
 */
export async function saveView(
	owner: SavedViewOwner,
	input: {
		moduleId: string;
		name: string;
		state: Record<string, unknown>;
		pinned?: boolean;
	},
): Promise<SavedView> {
	const name = input.name.trim();
	if (!name) throw new Error("SAVED_VIEW_NAME_REQUIRED");
	if (name.length > 80) throw new Error("SAVED_VIEW_NAME_TOO_LONG");

	// A ceiling, not a plan limit. Views cost nothing to store and are never
	// billed — this only stops a runaway client from writing forever.
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(savedViews)
		.where(
			and(
				eq(savedViews.workspaceId, owner.workspaceId),
				eq(savedViews.userId, owner.userId),
				eq(savedViews.moduleId, input.moduleId),
			),
		);
	if (count >= MAX_VIEWS_PER_MODULE) {
		throw new Error("SAVED_VIEW_LIMIT_REACHED");
	}

	const [row] = await db
		.insert(savedViews)
		.values({
			workspaceId: owner.workspaceId,
			userId: owner.userId,
			moduleId: input.moduleId,
			name,
			state: input.state,
			pinned: input.pinned ?? false,
			position: count,
		})
		.onConflictDoUpdate({
			target: [
				savedViews.workspaceId,
				savedViews.userId,
				savedViews.moduleId,
				savedViews.name,
			],
			set: {
				state: input.state,
				pinned: input.pinned ?? false,
				updatedAt: new Date(),
			},
		})
		.returning();
	return toDto(row);
}

/**
 * Delete one of this person's views.
 *
 * Scoped by owner in the WHERE clause rather than checked afterwards, so an id
 * belonging to somebody else simply matches nothing.
 */
export async function deleteSavedView(
	owner: SavedViewOwner,
	id: string,
): Promise<boolean> {
	const [removed] = await db
		.delete(savedViews)
		.where(
			and(
				eq(savedViews.workspaceId, owner.workspaceId),
				eq(savedViews.userId, owner.userId),
				eq(savedViews.id, id),
			),
		)
		.returning({ id: savedViews.id });
	return Boolean(removed);
}

/** Pin or unpin a view, which controls whether Home shows it. */
export async function setSavedViewPinned(
	owner: SavedViewOwner,
	id: string,
	pinned: boolean,
): Promise<SavedView | undefined> {
	const [row] = await db
		.update(savedViews)
		.set({ pinned, updatedAt: new Date() })
		.where(
			and(
				eq(savedViews.workspaceId, owner.workspaceId),
				eq(savedViews.userId, owner.userId),
				eq(savedViews.id, id),
			),
		)
		.returning();
	return row ? toDto(row) : undefined;
}
