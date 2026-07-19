import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { notifications } from "./schema/notifications";

export type NotificationInput = {
	userId: string;
	organizationId?: string | null;
	type: string;
	title: string;
	body?: string | null;
	href?: string | null;
};

export type NotificationRow = {
	id: string;
	userId: string;
	organizationId: string | null;
	type: string;
	title: string;
	body: string | null;
	href: string | null;
	readAt: Date | null;
	createdAt: Date;
};

// Write one in-app notification and return it (so a caller can reference its id).
export async function createNotification(
	input: NotificationInput,
): Promise<NotificationRow> {
	const [row] = await db
		.insert(notifications)
		.values({
			userId: input.userId,
			organizationId: input.organizationId ?? null,
			type: input.type,
			title: input.title,
			body: input.body ?? null,
			href: input.href ?? null,
		})
		.returning();
	return row;
}

// A user's inbox, newest first. `unreadOnly` powers the badge/dropdown's unread view.
export async function listNotifications(
	userId: string,
	options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationRow[]> {
	const where = options.unreadOnly
		? and(eq(notifications.userId, userId), isNull(notifications.readAt))
		: eq(notifications.userId, userId);
	return db
		.select()
		.from(notifications)
		.where(where)
		.orderBy(desc(notifications.createdAt))
		.limit(options.limit ?? 30);
}

export async function countUnreadNotifications(
	userId: string,
): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return row?.count ?? 0;
}

// Mark one notification read — scoped to the owner so a user can't touch another's rows.
export async function markNotificationRead(
	userId: string,
	id: string,
): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
