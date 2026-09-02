import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useHeaderCrumb } from "../components/header-action";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import {
	FailurePanel,
	FailureRow,
	FailureStatusLine,
} from "../components/page-state";

/**
 * Candidate error treatments, side by side. Development only.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Failure states are the least-seen screens in the console and therefore the
 * worst-looking. Reviewing one meant manufacturing a real 403 or 429 against a
 * running API, so in practice nobody reviewed them and each page drifted into
 * its own answer.
 *
 * 🔑 Every candidate below is fed a REAL classified error through the same
 * `presentRequestError` the live pages use, so the words are the real words.
 * Only the arrangement differs. Hand-drawn approximations would be worse than
 * nothing: they would look settled while the shipped states stayed ugly.
 *
 * ⚠️ Loading and empty states are deliberately absent. Those are finished and
 * are not being changed.
 */
function StatesPage() {
	useHeaderCrumb("Error states");
	return (
		<div className="space-y-10 p-5">
			<p className="max-w-lg text-[11.5px] text-[var(--ink-40)] leading-5">
				Three ways a module page could report a failure, each shown against
				every error it can classify. Pick one and it becomes the only one.
			</p>

			{CANDIDATES.map(({ key, name, rationale, render }) => (
				<section key={key} className="space-y-3">
					<div className="space-y-1">
						<h2 className="text-[12.5px] text-[var(--ink-85)]">{name}</h2>
						<p className="max-w-lg text-[11px] text-[var(--ink-35)] leading-4">
							{rationale}
						</p>
					</div>
					<div className="space-y-2">
						{FAULTS.map((error, index) => (
							<div key={FAULT_LABELS[index]}>{render(error)}</div>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

const CANDIDATES: Array<{
	key: string;
	name: string;
	rationale: string;
	render: (error: unknown) => ReactNode;
}> = [
	{
		key: "panel",
		name: "Shipping · In the empty state's frame",
		rationale:
			"The same box, in the same place, as an empty list. The page keeps its layout entirely; only the words and a signal dot say a failure happened rather than nothing existing.",
		render: (error) => <FailurePanel error={error} />,
	},
	{
		key: "row",
		name: "Rejected · In the table's frame",
		rationale:
			"The container the list would have filled reports the failure, on the table's own row grid and gutter. Nothing new appears on screen.",
		render: (error) => <FailureRow error={error} />,
	},
	{
		key: "status",
		name: "Rejected · Status line",
		rationale:
			"The register a backend's operators already read: status, condition, request id. One row of height, no panel.",
		render: (error) => <FailureStatusLine error={error} />,
	},
];

/** An error shaped exactly like one the SDK throws. */
function fault(status: number) {
	return Object.assign(new Error(`HTTP ${status}`), {
		status,
		requestId: "3f2b91c4-8d17-4a6e-9c05-1b7e2d4a8f60",
	});
}

const FAULTS: unknown[] = [
	new TypeError("Failed to fetch"),
	fault(500),
	fault(400),
	fault(403),
	fault(404),
	fault(409),
	fault(429),
	fault(401),
];

const FAULT_LABELS = [
	"offline",
	"500",
	"400",
	"403",
	"404",
	"409",
	"429",
	"401",
] as const;

export const Route = createFileRoute("/$workspace/states")({
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	// 🔴 Development only. A candidate gallery reachable in production is a page
	// that looks like a real part of the product and is not one.
	beforeLoad: () => {
		if (import.meta.env.PROD) throw new Error("Not found");
	},
	component: StatesPage,
});
