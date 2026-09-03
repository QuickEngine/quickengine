import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DashboardBoard } from "../components/dashboard/board";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import { quickDashQueries } from "../lib/quickdash-api";

function HomePage() {
	const { workspaceId: workspace } = Route.useRouteContext();
	const { workspace: slug } = Route.useParams();
	const context = useQuery(quickDashQueries.context(workspace));

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{/*
			 * 🔑 The date rides the breadcrumb row rather than a line of its own.
			 * "Home" and "today" are one statement about where you are, and giving
			 * the date its own row cost a band of empty page above the first tile.
			 */}
			<DashboardBoard
				workspaceId={workspace}
				workspace={slug}
				modules={context.data?.modules ?? []}
			/>
		</main>
	);
}

export const Route = createFileRoute("/$workspace/")({
	component: HomePage,
	/* Contained in the outlet, so a failure here never takes the console with
	   it — see `components/outlet-error.tsx`. */
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
});
