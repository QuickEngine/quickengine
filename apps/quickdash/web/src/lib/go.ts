import type { useNavigate } from "@tanstack/react-router";

/**
 * Follow a notification's or a toast's `href` without reloading the page.
 *
 * 🔴 This used to be `window.location.assign`, which worked and cost the whole
 * application: a full document load threw away every other toast still on
 * screen, the open panel, and the scroll position — so acting on one piece of
 * news destroyed the rest of it.
 *
 * ⚠️ The router will not parse a query string out of `to`. `?record=` is how
 * this console addresses a single record, so it has to be split off and handed
 * over as `search` or the toast lands on the list instead of the order.
 */
export function follow(
	navigate: ReturnType<typeof useNavigate>,
	href: string,
): void {
	const [path, query] = href.split("?");
	void navigate({
		to: path,
		search: Object.fromEntries(new URLSearchParams(query ?? "")) as never,
	});
}
