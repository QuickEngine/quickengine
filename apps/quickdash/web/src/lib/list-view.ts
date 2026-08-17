import { useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";

/**
 * Whether a list is shown as a table or as cards.
 *
 * 🔑 Remembered per PAGE, per workspace. Products suit cards — they have
 * photographs — while Orders suit a table, and one setting for the whole
 * console forced the same answer on both. The preference is about a particular
 * list, so it is stored against that list.
 *
 * The PAGE NUMBER deliberately is not remembered: nobody wants to reopen
 * Orders on page 4.
 *
 * ⚠️ Layout lives at PAGE level while paging lives inside `PagedTable`. That
 * split is not arbitrary: the toggle sits in the control bar at the top of the
 * page and the pager sits under the table, and a hook cannot be called inside
 * the render callback where most pages compute their filtered rows.
 */

export type ListLayout = "table" | "cards";

const key = (workspaceId: string, scope: string) =>
	`quickdash:list-layout:${workspaceId}:${scope}`;

/**
 * Which list this is, taken from the address rather than passed in.
 *
 * ⚠️ The WORKSPACE segment is dropped, so the same page in two workspaces is
 * still one preference per workspace — `/caffeinate/orders` and
 * `/gemsutopia/orders` both scope to `orders`, and the workspace id in the
 * storage key keeps them apart.
 */
export function useListScopeKey() {
	return useRouterState({
		select: (state) =>
			state.location.pathname.split("/").filter(Boolean).slice(1).join("/") ||
			"home",
	});
}

export function useListLayout(workspaceId: string) {
	const scope = useListScopeKey();
	const [layout, setLayoutState] = useState<ListLayout>(() => {
		try {
			return window.localStorage.getItem(key(workspaceId, scope)) === "cards"
				? "cards"
				: "table";
		} catch {
			// Private browsing or a full quota. A forgotten preference is not worth
			// an error.
			return "table";
		}
	});

	const setLayout = useCallback(
		(next: ListLayout) => {
			setLayoutState(next);
			try {
				window.localStorage.setItem(key(workspaceId, scope), next);
			} catch {
				// Same reasoning: this must never break the page.
			}
		},
		[workspaceId, scope],
	);

	return { layout, setLayout };
}

/**
 * How many records on a page.
 *
 * 🔴 A hard cap, not a preference. A workspace with fifty thousand records must
 * never try to lay fifty thousand rows — or worse, fifty thousand cards — into
 * one page: the browser stalls and the list becomes unusable at exactly the
 * scale where it matters most.
 */
export const PAGE_SIZE = 25;
