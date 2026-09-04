import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardBoard } from "../components/dashboard/board";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import { quickDashQueries } from "../lib/quickdash-api";

function HomePage() {
	/**
	 * 🔑 `?boom=outlet` previews the ordinary failure: a route breaking inside a
	 * working console. The sidebar, the header and the trail all survive and the
	 * card appears where the page would have been, which is the case somebody
	 * actually meets. `?boom` on its own throws at the root instead, where there
	 * is genuinely nothing left behind the wall. Dev only; Vite strips it.
	 */
	if (
		import.meta.env.DEV &&
		new URLSearchParams(window.location.search).get("boom") === "outlet"
	) {
		throw new Error("Previewing the outlet error. Remove ?boom to leave.");
	}
	const { workspaceId: workspace } = Route.useRouteContext();
	const { workspace: slug } = Route.useParams();
	const context = useQuery(quickDashQueries.context(workspace));

	/**
	 * `?firstRun=1` pretends the workspace has no modules.
	 *
	 * 🔑 The state a customer meets FIRST is the one nobody on the team can
	 * reach: every workspace here has modules on, and turning them off to look
	 * at a screen means dismantling a working business and putting it back.
	 * So it went unlooked-at until somebody landed in it for real.
	 *
	 * ⚠️ Only the modules are emptied. The request still succeeds, which is the
	 * whole distinction this screen turns on: an empty list is "none are on",
	 * and a failed one is "we have no idea".
	 */
	/**
	 * `?slow=3` holds the board in its loading state for three seconds.
	 *
	 * On a fast local API the skeleton exists for about forty milliseconds, so
	 * the one state that every single visit passes through is the one nobody
	 * can look at.
	 */
	const slow = import.meta.env.DEV
		? Number(new URLSearchParams(window.location.search).get("slow") ?? 0)
		: 0;
	const [settled, setSettled] = useState(!slow);
	useEffect(() => {
		if (settled) return;
		const timer = setTimeout(() => setSettled(true), slow * 1000);
		return () => clearTimeout(timer);
	}, [settled, slow]);

	const pretendFirstRun =
		import.meta.env.DEV &&
		new URLSearchParams(window.location.search).get("firstRun") === "1";

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
				modules={pretendFirstRun ? [] : (context.data?.modules ?? [])}
				/* 🔴 Whether the list is EMPTY or merely UNKNOWN.
				   `data?.modules ?? []` reads the same either way, so a failed
				   context request made a fully configured workspace look brand new
				   and told the operator to go and set it up. The board must not
				   guess: only a query that actually came back can say "nothing is
				   switched on". */
				modulesKnown={settled && (pretendFirstRun || context.isSuccess)}
				modulesError={
					pretendFirstRun ? null : context.isError ? context.error : null
				}
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
