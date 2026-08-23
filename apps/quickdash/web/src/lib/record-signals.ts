import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { sessionApi } from "./api";
import { type NotificationSignal, quickDashQueries } from "./quickdash-api";

/**
 * Which records currently have an unread notification against them.
 *
 * 🔑 The dot on a row and the entry in the bell are now the SAME fact. Before
 * this the dots were computed from the data (an order still `placed`, an
 * invoice past its date) while the bell came from events — two sources that
 * agreed today and would drift tomorrow. One source means marking a
 * notification read clears the row it pointed at, which is what somebody
 * expects and could not previously happen.
 *
 * ⚠️ Reads the SAME query the bell does, so it costs no extra request and the
 * two can never show different answers.
 */
export function useRecordSignals(workspaceId: string) {
	const notifications = useQuery(quickDashQueries.notifications(workspaceId));

	const byRecord = new Map<string, NotificationSignal>();
	const rank: Record<NotificationSignal, number> = {
		news: 0,
		attention: 1,
		failure: 2,
	};

	for (const item of notifications.data?.items ?? []) {
		if (item.readAt || !item.recordId) continue;
		const existing = byRecord.get(item.recordId);
		// Loudest wins when one record has several unread notices.
		if (!existing || rank[item.signal] > rank[existing]) {
			byRecord.set(item.recordId, item.signal);
		}
	}

	/** Pass straight to a table's `rowSignal`. */
	return (row: { id: string }) => byRecord.get(row.id) ?? null;
}

/**
 * Opening a record acknowledges what the notification was telling you.
 *
 * 🔴 The dot exists to say "something happened here that you have not seen".
 * Once somebody opens the record, they have seen it — so leaving the dot lit
 * means the console is still asking for attention it has already had. Worse,
 * after refunding an order the row kept its mark, which reads as an order still
 * needing something rather than one that is finished.
 *
 * ⚠️ Marks read by RECORD, not by notification, because a record can carry
 * several. One order can be paid, disputed and refunded; opening it accounts
 * for all of them, and clearing one of three would leave the dot lit anyway.
 *
 * ⚠️ Fire-and-forget. Failing to mark something read must never interrupt
 * opening the thing somebody asked for — the worst case is a dot that stays a
 * little longer, and the next poll corrects it.
 */
export function useAcknowledgeRecord(
	workspaceId: string,
	recordId: string | null,
) {
	const notifications = useQuery(quickDashQueries.notifications(workspaceId));
	const queryClient = useQueryClient();
	const unreadIds = (notifications.data?.items ?? [])
		.filter((item) => !item.readAt && item.recordId === recordId)
		.map((item) => item.id)
		.join(",");

	useEffect(() => {
		if (!recordId || !unreadIds) return;
		void Promise.all(
			unreadIds.split(",").map((id) =>
				sessionApi.request(`/account/notifications/${id}/read`, {
					method: "POST",
				}),
			),
		)
			.then(() =>
				queryClient.invalidateQueries({
					predicate: (query) =>
						query.queryKey[0] === "quickdash" &&
						query.queryKey.includes("notifications"),
				}),
			)
			.catch(() => {
				// See above: a dot that lingers is not worth failing an open over.
			});
	}, [recordId, unreadIds, queryClient]);
}
