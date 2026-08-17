import type {
	NotificationSignal,
	QuickDashNotification,
} from "./quickdash-api";

/**
 * Unread notifications, turned into dots on the sidebar rows they belong to.
 *
 * 🔑 Derived from the notification's own `href` rather than from a second table
 * mapping event types to nav rows. The href is already the answer to "where
 * would you go to deal with this", which is exactly what the dot means — and a
 * separate mapping would drift the moment a notification's destination changed,
 * putting the dot on one page and the link on another.
 *
 * So a disputed payment lights Payments, a paid order lights Orders, a flagged
 * shipment lights Shipping, and low stock lights Inventory, with no per-event
 * wiring anywhere.
 */

export type NavSignal = { count: number; signal: NotificationSignal };

/** Loudest wins when several notifications point at one row. */
const RANK: Record<NotificationSignal, number> = {
	news: 0,
	attention: 1,
	failure: 2,
};

/**
 * Keys are `module/section`, matching exactly what the nav looks up.
 *
 * ⚠️ A module's INDEX child has an empty section, so its key ends in a slash.
 * `orders` and `orders/` are different keys and only the second one is ever
 * looked up — getting this wrong produces no dot and no error.
 *
 * `/caffeinate/client-records/messages` → `client-records/messages`
 * `/caffeinate/orders`                  → `orders/`
 */
export function navSignals(
	items: QuickDashNotification[] | undefined,
): Record<string, NavSignal> {
	const badges: Record<string, NavSignal> = {};
	for (const item of items ?? []) {
		if (item.readAt || !item.href) continue;
		// Drop the leading workspace segment; what remains is module and section.
		const [module, section = ""] = item.href
			.replace(/^\/+/, "")
			.split("/")
			.slice(1);
		if (!module) continue;
		const key = `${module}/${section}`;

		const existing = badges[key];
		badges[key] = {
			count: (existing?.count ?? 0) + 1,
			signal:
				existing && RANK[existing.signal] >= RANK[item.signal]
					? existing.signal
					: item.signal,
		};
	}
	return badges;
}

/**
 * Merge in a count the nav already tracked from its own source.
 *
 * ⚠️ Unread MESSAGES are counted from the conversation list, not from
 * notifications: a message read in QuickDash clears the conversation but the
 * notification may still be unread, and vice versa. Taking the larger of the
 * two keeps the dot honest — it disappears only once both agree there is
 * nothing waiting.
 */
export function withCount(
	badges: Record<string, NavSignal>,
	key: string,
	count: number,
	signal: NotificationSignal = "news",
): Record<string, NavSignal> {
	if (count <= 0) return badges;
	const existing = badges[key];
	return {
		...badges,
		[key]: {
			count: Math.max(existing?.count ?? 0, count),
			signal:
				existing && RANK[existing.signal] >= RANK[signal]
					? existing.signal
					: signal,
		},
	};
}
