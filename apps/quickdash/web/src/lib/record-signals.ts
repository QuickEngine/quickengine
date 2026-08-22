import { useQuery } from "@tanstack/react-query";
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
