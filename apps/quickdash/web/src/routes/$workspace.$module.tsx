import { createFileRoute } from "@tanstack/react-router";

/**
 * `/$workspace/$module` — every module's operator surface.
 *
 * ⚠️ Cleared 2026-08-15 for the redesign. This file previously held the queries
 * AND the presentation for all sixteen modules in one component; the replacement
 * is per-module routes. The queries themselves are worth keeping and are in git
 * history at this path.
 *
 * The search contract stays: list state travels in the URL, so a filtered view
 * survives a reload and can be linked to.
 */
function ModulePage() {
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/$workspace/$module")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		q?: string;
		status?: string;
		sort?: string;
		page?: number;
	} => ({
		q: search.q === undefined ? undefined : String(search.q),
		status: search.status === undefined ? undefined : String(search.status),
		sort: search.sort === undefined ? undefined : String(search.sort),
		page: search.page === undefined ? undefined : Number(search.page),
	}),
	component: ModulePage,
});
