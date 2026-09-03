import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "./client";
import { notifications } from "./schema/notifications";

export type NotificationInput = {
	userId: string;
	organizationId?: string | null;
	/** Which workspace this is about, where it is about one. */
	workspaceId?: string | null;
	/**
	 * 🔴 Whether this happened with real money.
	 *
	 * A sandbox "New order" and a live "New order" are not the same news. Acting
	 * on a test as though it were real, or ignoring a real one as though it were
	 * a test, are both failures — and until this existed the bell could not tell
	 * them apart.
	 */
	environment?: "test" | "live" | null;
	type: string;
	/**
	 * How loudly to say it. Defaults to `news`, which is what most things are.
	 * Reach for `attention` only when somebody has to decide something, and
	 * `failure` only when money or a customer is already affected.
	 */
	signal?: "news" | "attention" | "failure";
	title: string;
	body?: string | null;
	href?: string | null;
	/**
	 * What produced this — an outbox event id, usually.
	 *
	 * Supplying it makes the write idempotent: a redelivered event updates
	 * nothing and creates nothing. Omit it for notifications written directly,
	 * which have no redelivery to guard against.
	 */
	sourceKey?: string | null;
	/** The record this is about, so a list can mark the row it belongs to. */
	recordId?: string | null;
};

export type NotificationRow = {
	id: string;
	userId: string;
	organizationId: string | null;
	/**
	 * The record this is about — the order, the payment, the shipment.
	 *
	 * 🔴 Already selected and already returned; the type simply did not admit
	 * it, so no caller could use it. That is why opening the order a
	 * notification is about did nothing: the screen had no way to tell which
	 * notification belonged to what it was showing.
	 */
	recordId: string | null;
	type: string;
	signal: "news" | "attention" | "failure";
	title: string;
	body: string | null;
	href: string | null;
	readAt: Date | null;
	createdAt: Date;
};

/**
 * Write one in-app notification.
 *
 * Returns null when `sourceKey` matched an existing row — the notification is
 * already in the inbox and nothing was written. Callers that only want the
 * person told can ignore the result; callers that want to know whether THIS
 * call is what told them should check it.
 */
export async function createNotification(
	input: NotificationInput,
): Promise<NotificationRow | null> {
	const [row] = await db
		.insert(notifications)
		.values({
			userId: input.userId,
			organizationId: input.organizationId ?? null,
			workspaceId: input.workspaceId ?? null,
			environment: input.environment ?? null,
			type: input.type,
			signal: input.signal ?? "news",
			title: input.title,
			body: input.body ?? null,
			href: input.href ?? null,
			sourceKey: input.sourceKey ?? null,
			recordId: input.recordId ?? null,
		})
		// 🔴 Silently does nothing on a repeat. The outbox delivers at least once,
		// so this WILL happen — and telling somebody twice that they got one order
		// is worse than not telling them at all, because after that they stop
		// believing the number.
		.onConflictDoNothing({
			target: [notifications.userId, notifications.sourceKey],
		})
		.returning();
	return row ?? null;
}

// A user's inbox, newest first. `unreadOnly` powers the badge/dropdown's unread view.
/**
 * What to tell somebody, newest first.
 *
 * 🔴 `environment` is a FILTER, not decoration. Sandbox and live notifications
 * must never appear in the same list: "New order" meaning a real customer paid
 * and "New order" meaning somebody pressed a test card look identical, and
 * mixing them means either acting on a test or ignoring a real sale.
 *
 * ⚠️ Rows with no environment are account-level — an invitation, a billing
 * notice — and belong in BOTH lists. They are not commerce and have no mode.
 */
export async function listNotifications(
	userId: string,
	options: {
		limit?: number;
		unreadOnly?: boolean;
		environment?: "test" | "live";
	} = {},
): Promise<NotificationRow[]> {
	const where = and(
		eq(notifications.userId, userId),
		options.unreadOnly ? isNull(notifications.readAt) : undefined,
		options.environment
			? or(
					eq(notifications.environment, options.environment),
					isNull(notifications.environment),
				)
			: undefined,
	);
	return db
		.select()
		.from(notifications)
		.where(where)
		.orderBy(desc(notifications.createdAt))
		.limit(options.limit ?? 30);
}

export async function countUnreadNotifications(
	userId: string,
	options: { environment?: "test" | "live" } = {},
): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(
			and(
				eq(notifications.userId, userId),
				isNull(notifications.readAt),
				options.environment
					? or(
							eq(notifications.environment, options.environment),
							isNull(notifications.environment),
						)
					: undefined,
			),
		);
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

/**
 * Put one back to unread.
 *
 * 🔑 The undo for a misclick, and the reason "mark read" can be a one-press
 * action rather than a confirmation. Opening a notification marks it read
 * automatically, so without this, glancing at something and deciding to deal
 * with it later left no way to make it look like it still needs dealing with.
 */
export async function markNotificationUnread(
	userId: string,
	id: string,
): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: null })
		.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

/**
 * Remove one from the inbox for good.
 *
 * ⚠️ A hard delete, and that is the right shape here. A notification is never
 * the only copy of anything — it points at an order, an invoice, a dispute,
 * all of which outlive it — so keeping a dismissed row would preserve nothing
 * but the fact that somebody dismissed it. Scoped to the owner, so one person
 * can never clear another's inbox.
 */
export async function dismissNotification(
	userId: string,
	id: string,
): Promise<void> {
	await db
		.delete(notifications)
		.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

/**
 * Empty the inbox of everything already dealt with.
 *
 * 🔴 READ rows only, and that restriction is the whole design. "Clear all"
 * would let one press destroy something the person has never laid eyes on,
 * which is precisely the silent bulk action this panel is trying not to be.
 * Clearing what you have already read cannot lose you anything.
 */
export async function dismissReadNotifications(userId: string): Promise<void> {
	await db
		.delete(notifications)
		.where(
			and(eq(notifications.userId, userId), isNotNull(notifications.readAt)),
		);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
