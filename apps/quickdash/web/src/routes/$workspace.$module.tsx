import { createFileRoute } from "@tanstack/react-router";
import { ProductsView } from "../components/products-view";

/**
 * `/$workspace/$module` — every module's operator surface.
 *
 * ⚠️ Cleared 2026-08-15 for the redesign. This file previously held the queries
 * AND the presentation for all sixteen modules in one component; the replacement
 * is one view per module, dispatched here. The old queries are worth keeping and
 * are in git history at this path.
 *
 * A module with no view yet renders nothing rather than a placeholder — an empty
 * page is honest about being unbuilt; "coming soon" is not.
 *
 * The search contract stays: list state travels in the URL, so a filtered view
 * survives a reload and can be linked to.
 */
function ModulePage() {
	const { workspace, module } = Route.useParams();
	if (module === "products-services") {
		return <ProductsView workspaceId={workspace} />;
	}
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
