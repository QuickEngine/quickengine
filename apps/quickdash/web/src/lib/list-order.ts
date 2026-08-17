import { useCallback, useMemo, useState } from "react";
import { useListScopeKey } from "./list-view";

/**
 * The order somebody has dragged a list into.
 *
 * 🔑 A VIEW preference, kept per page per workspace — not a field on the
 * records. Almost nothing in QuickDash has an inherent order: orders arrive
 * when they arrive, invoices are dated, customers are alphabetical. Writing a
 * dragged order back to the server would mean inventing a `sort_order` column
 * on a dozen tables and answering "whose order is it?" for every teammate who
 * disagrees.
 *
 * ⚠️ So this is deliberately LOCAL and per person. It changes how you read a
 * list, never what the list is. Where a record genuinely has an order the
 * business shares — a category's `sortOrder`, a product's photographs — that
 * stays on the server and is not this.
 */

const key = (workspaceId: string, scope: string) =>
	`quickdash:list-order:${workspaceId}:${scope}`;

function read(workspaceId: string, scope: string): string[] {
	try {
		const stored = window.localStorage.getItem(key(workspaceId, scope));
		const parsed: unknown = stored ? JSON.parse(stored) : null;
		return Array.isArray(parsed)
			? parsed.filter((id): id is string => typeof id === "string")
			: [];
	} catch {
		return [];
	}
}

export function useListOrder<TRow extends { id: string }>(
	workspaceId: string,
	rows: TRow[],
) {
	const scope = useListScopeKey();
	const [order, setOrderState] = useState<string[]>(() =>
		read(workspaceId, scope),
	);

	const ordered = useMemo(() => {
		if (order.length === 0) return rows;
		const rank = new Map(order.map((id, index) => [id, index]));
		/**
		 * 🔴 Records with no remembered position keep their natural order and go
		 * FIRST, not last. A new order arriving today must not appear at the
		 * bottom of a list somebody arranged last week — that is exactly how a
		 * new thing gets missed.
		 */
		return [...rows].sort((a, b) => {
			const left = rank.get(a.id);
			const right = rank.get(b.id);
			if (left === undefined && right === undefined) return 0;
			if (left === undefined) return -1;
			if (right === undefined) return 1;
			return left - right;
		});
	}, [rows, order]);

	const move = useCallback(
		(fromId: string, toId: string) => {
			if (fromId === toId) return;
			// Built from what is on screen, so a first drag has a complete list to
			// reorder rather than a sparse one.
			const ids = ordered.map((row) => row.id);
			const from = ids.indexOf(fromId);
			const to = ids.indexOf(toId);
			if (from === -1 || to === -1) return;
			ids.splice(to, 0, ...ids.splice(from, 1));
			setOrderState(ids);
			try {
				window.localStorage.setItem(
					key(workspaceId, scope),
					JSON.stringify(ids),
				);
			} catch {
				// Private browsing. The order still applies for this session.
			}
		},
		[ordered, workspaceId, scope],
	);

	const reset = useCallback(() => {
		setOrderState([]);
		try {
			window.localStorage.removeItem(key(workspaceId, scope));
		} catch {
			// Same reasoning.
		}
	}, [workspaceId, scope]);

	return { rows: ordered, move, reset, arranged: order.length > 0 };
}
