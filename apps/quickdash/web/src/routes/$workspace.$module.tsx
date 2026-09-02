import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OutletError, OutletNotFound } from "../components/outlet-error";

/**
 * `/$workspace/$module` — the layout every module page sits inside.
 *
 * Renders only its child: the module's own surface lives in the `index` route,
 * and its sub-pages in `$section`. A layout that painted a view of its own
 * would show through underneath every sub-page.
 *
 * The search contract lives here so it is shared: list state travels in the
 * URL, meaning a filtered view survives a reload and can be linked to.
 */
export const Route = createFileRoute("/$workspace/$module")({
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		q?: string;
		status?: string;
		sort?: string;
		page?: number;
		/** A record to open on arrival — how search reaches a detail panel. */
		record?: string;
	} => ({
		q: search.q === undefined ? undefined : String(search.q),
		status: search.status === undefined ? undefined : String(search.status),
		sort: search.sort === undefined ? undefined : String(search.sort),
		page: search.page === undefined ? undefined : Number(search.page),
		record: search.record === undefined ? undefined : String(search.record),
	}),
	component: () => <Outlet />,
});
