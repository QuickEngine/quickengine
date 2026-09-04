import { createFileRoute, Link } from "@tanstack/react-router";
import { useHeaderCrumb } from "../components/header-action";
import { OutletError, OutletNotFound } from "../components/outlet-error";

/**
 * The index of error states, so there is one address to remember.
 *
 * `/{workspace}/errors` lists what `/{workspace}/errors/{status}` will show.
 * Without it the preview route is only useful to somebody who already knows
 * which numbers are covered, which is nobody a fortnight from now.
 */

const STATES = [
	["400", "The request was refused as malformed"],
	["401", "Signed out, or the session expired"],
	["402", "The plan does not include this"],
	["403", "Signed in, but not allowed"],
	["404", "No such page"],
	["409", "Something changed underneath you"],
	["413", "Too large to send"],
	["429", "Too many requests, briefly"],
	["500", "A fault on our side"],
	["503", "A dependency is busy"],
	["504", "It ran out of time"],
] as const;

function ErrorIndex() {
	useHeaderCrumb("Errors");
	const { workspace } = Route.useParams();
	return (
		<div className="space-y-4 p-5">
			<p className="max-w-lg text-[11.5px] text-[var(--ink-40)] leading-5">
				Every failure screen the console can show, rendered by the real
				component from a real error. Each one appears in the outlet, with the
				sidebar and header still there, the way a failure on one page should
				never take the whole window with it.
			</p>
			<ul className="flex max-w-lg flex-col gap-1">
				{STATES.map(([code, what]) => (
					<li key={code}>
						<Link
							to="/$workspace/errors/$code"
							params={{ workspace, code }}
							className="flex items-center gap-3 rounded-md border border-[var(--console-line)] bg-[var(--console-card)] px-3 py-2.5 no-underline transition-colors hover:border-[var(--console-line-strong)]"
						>
							<span className="font-mono text-[11px] text-[var(--ink-30)] tabular-nums">
								{code}
							</span>
							<span className="text-[12px] text-[var(--ink-70)]">{what}</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

export const Route = createFileRoute("/$workspace/errors/")({
	/* 🔴 Without these, a fault here escapes to the ROOT boundary, which
	   replaces the entire application: the sidebar, the header and the page
	   you were on all vanish behind a wall. Registered here, the console
	   survives and the card appears in the outlet where the page would have
	   been, which is what every other route already does. */
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	component: ErrorIndex,
});
