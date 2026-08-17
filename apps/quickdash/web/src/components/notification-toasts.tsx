import { useEffect, useRef } from "react";
import type { QuickDashNotification } from "../lib/quickdash-api";
import { useToast } from "./toast";

/**
 * The bridge from the notification inbox to the corner of the screen.
 *
 * 🔑 Derived from the bell rows rather than fired alongside them. If toasts had
 * their own source, the two could disagree — a toast for something the bell
 * never recorded, or worse, a sale that toasted and then vanished on reload.
 * Reading the same list means a toast is only ever a *preview* of a row that is
 * already durable.
 *
 * ⚠️ Silent on the first load, on purpose. Arriving at the dashboard with nine
 * unread notifications must not throw nine toasts at somebody — that is the
 * bell's job, and it already has the number on it. Only rows that appear while
 * the operator is sitting here are new information.
 */
export function NotificationToasts({
	items,
}: {
	items: QuickDashNotification[] | undefined;
}) {
	const toast = useToast();
	const seen = useRef<Set<string> | null>(null);

	useEffect(() => {
		if (!items) return;

		// First sight of the list: record it and say nothing.
		if (seen.current === null) {
			seen.current = new Set(items.map((item) => item.id));
			return;
		}

		const known = seen.current;
		const arrivals = items.filter(
			(item) => !known.has(item.id) && item.readAt === null,
		);
		for (const item of items) known.add(item.id);
		if (arrivals.length === 0) return;

		// Oldest first, so the newest ends up nearest the bottom of the stack where
		// the eye lands.
		for (const item of arrivals.slice().reverse()) {
			// Already looking at the thing it wants to tell you about. Interrupting
			// somebody to point at their own screen is how a toast becomes an
			// annoyance; the bell still records it.
			if (item.href && isCurrentPage(item.href)) continue;

			toast.show({
				// The notification id, so a refetch that returns the same row cannot
				// toast it twice.
				id: item.id,
				signal: item.signal,
				title: item.title,
				body: item.body,
				href: item.href,
			});
		}
	}, [items, toast]);

	return null;
}

/** Whether the operator is already on the page a notification links to. */
function isCurrentPage(href: string) {
	try {
		const target = new URL(href, window.location.origin);
		return target.pathname === window.location.pathname;
	} catch {
		return false;
	}
}
