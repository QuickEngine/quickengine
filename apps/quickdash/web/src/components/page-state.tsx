import {
	presentRequestError,
	type RequestErrorPresentation,
} from "@quickengine/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { clientEnv } from "../lib/env";
import { TRANSIENT_TOAST } from "../lib/transient-toast";
import { EnvironmentWall } from "./environment-wall";
import { ContactSupport, GoBack } from "./error-actions";
import { useDeclareTakeover } from "./header-action";
import { NoAccess } from "./no-access";
import { ErrorCard, OutletNotFound, RequestIdInline } from "./outlet-error";
import { PlanWall } from "./plan-wall";
import { SkeletonPanel, SkeletonRows } from "./skeletons";
import { useToast } from "./toast";

/**
 * Loading, failure and emptiness, decided once for every module page.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Twenty-nine pages each inventing "Loading…", "did not load" and "nothing yet"
 * produces twenty-nine slightly different answers, and the failure states are
 * the ones nobody checks — so they are exactly where the differences land. The
 * rebuilt console had already drifted: some pages said "did not load" with no
 * reason and no retry, and one crashed the whole page on a missing field.
 *
 * 🔴 Failures route through `presentRequestError`, which classifies by STATUS —
 * a 403 says you lack permission, a 404 says it is gone, a 429 says slow down,
 * a network error says check the connection. "Something went wrong" tells an
 * operator nothing they can act on, and every one of those cases has a
 * different next step.
 *
 * ⚠️ It shows the REQUEST ID on failure. That is the single most useful thing on
 * a broken screen: it turns "orders didn't load" into a line somebody can find
 * in the logs, and the Connect page already has a lookup that takes one.
 */
export function PageState<TData>({
	query,
	/** Rendered when the request succeeded and the data is genuinely empty. */
	empty,
	/** True when `query.data` should count as nothing at all. */
	isEmpty,
	loadingLabel = "Loading…",
	skeleton = "rows",
	children,
}: {
	query: UseQueryResult<TData>;
	empty?: ReactNode;
	isEmpty?: (data: TData) => boolean;
	/** Announced to screen readers; the visual placeholder carries no text. */
	loadingLabel?: string;
	/**
	 * Which shape to hold while waiting. `rows` for a list, `panel` for a side
	 * panel — chosen by the caller because only it knows what is coming.
	 */
	skeleton?: "rows" | "panel";
	children: (data: TData) => ReactNode;
}) {
	// Development-only review switch; compiled away in production. Placed first
	// so it wins over a query that has already succeeded — otherwise a page with
	// cached data could never be made to show its failure state.
	/**
	 * `?after=3` holds the forced failure back for three seconds, so the page
	 * LOADS and then breaks.
	 *
	 * 🔑 Without it a forced failure fires on the first render, which only ever
	 * demonstrates "this page could not load". The interesting case is the
	 * opposite and cannot otherwise be staged: data already on screen, a
	 * background refetch fails, and what happens to the rows somebody is in the
	 * middle of reading.
	 */
	const [armed, setArmed] = useState(() => {
		if (!import.meta.env.DEV) return true;
		return !new URLSearchParams(window.location.search).get("after");
	});
	useEffect(() => {
		if (armed || !import.meta.env.DEV) return;
		const wait = Number(
			new URLSearchParams(window.location.search).get("after") ?? 0,
		);
		const timer = setTimeout(() => setArmed(true), wait * 1000);
		return () => clearTimeout(timer);
	}, [armed]);

	const forced = armed ? forcedFailure() : null;
	const failure = forced ?? (query.isError ? query.error : null);

	/**
	 * 🔴 Only a page's PRIMARY content declares a takeover.
	 *
	 * A detail panel that 404s has lost one record, not the page — taking over on
	 * its behalf would strip the list's search and filters because the thing you
	 * clicked has gone. Panels identify themselves with `skeleton="panel"`.
	 */
	/**
	 * 🔴 STALE: a failure with good data already in hand.
	 *
	 * TanStack keeps the last successful `data` when a refetch fails, and this
	 * checked `isError` before it checked whether there was anything to show.
	 * So a background poll failing REPLACED the list somebody was reading:
	 * forty-seven rows, the scroll position, the selection and any open panel,
	 * all thrown away because one request did not come back. The data was still
	 * sitting there the whole time.
	 *
	 * Old is not the same as gone. The rows were true a minute ago and are
	 * almost certainly true now, so they stay, with a line saying they may have
	 * moved on and a way to try again.
	 *
	 * ⚠️ TWO failures still take over, because they make what is on screen
	 * WRONG rather than merely old: a dead session (every number came from a
	 * login that no longer exists) and a permission loss (you are not entitled
	 * to be reading this at all).
	 */
	const kindOf = failure ? presentRequestError(failure).kind : null;
	const stale =
		Boolean(failure) &&
		query.data !== undefined &&
		kindOf !== "authentication" &&
		kindOf !== "permission";

	const takesOver =
		!stale && skeleton !== "panel" && isTakeoverFailure(failure);
	useDeclareTakeover(takesOver);

	// `isPending && !data` rather than `isPending`: a query holding placeholder
	// data from a previous fetch must keep showing it. Flashing a skeleton over
	// content that is already correct reads as the page breaking.
	if (!failure && query.isPending && query.data === undefined) {
		return (
			<>
				{/* The label is for screen readers only. Sighted people are already
				    being told by the placeholder, and "Loading orders…" sitting in
				    the corner of an empty page was the whole complaint. */}
				<span className="sr-only" aria-busy="true">
					{loadingLabel}
				</span>
				{skeleton === "panel" ? <SkeletonPanel /> : <SkeletonRows />}
			</>
		);
	}

	if (stale && query.data !== undefined) {
		return (
			<>
				<StaleNotice
					error={failure}
					onRetry={() => {
						void query.refetch();
					}}
				/>
				{children(query.data)}
			</>
		);
	}

	if (failure) {
		/**
		 * 🔴 A dead session invalidates the WHOLE console, not this page.
		 *
		 * Everything on screen came from a session that no longer exists — the
		 * sidebar counts, the notification bell, the record in the panel. Reporting
		 * that inside the dashboard leaves somebody sitting in a workspace that
		 * looks like it still works, clicking things that will all fail the same
		 * way. It is the one failure where staying put is the confusing answer.
		 *
		 * ⚠️ Contrast with a 404, which is handled below and deliberately stays in
		 * the chrome: one page is missing, the console around it is fine, and
		 * throwing somebody out of the dashboard over a bad address is worse than
		 * the address being bad.
		 */
		const it = presentRequestError(failure);
		const kind = it.kind;
		if (kind === "authentication") return <SessionEnded />;
		/**
		 * 🔴 Neither a server fault nor an offline blip takes the screen.
		 * Reversed 2026-09-03.
		 *
		 * The old reasoning — "if the API is failing, every page fails, so take
		 * the screen" — is wrong about both. A 500 is usually one route
		 * throwing, not the API being down; orders can fail while products and
		 * settings are fine. And going offline for four seconds on a train wiped
		 * the page somebody was reading, when nothing was broken at all.
		 *
		 * A server fault takes over the PAGE (see `isTakeoverFailure`): its
		 * search and buttons stand down because there is nothing to operate on,
		 * while the sidebar stays and you can navigate away.
		 *
		 * 🔑 Offline does not even do that. It is a property of the WINDOW, not
		 * this page — the rows already on screen are still true — so it reports
		 * itself as one inline line and `ConnectionBanner` says the rest. Two
		 * places, because the line explains why THIS list is stale and the
		 * banner explains why everything is.
		 */
		/**
		 * 🔑 The TRANSIENT failures, and the only two that heal themselves.
		 *
		 * Offline and rate-limited share the shape that matters: nothing is
		 * broken, nobody has to decide anything, and the identical request will
		 * succeed shortly. Both used to get a whole screen or a whole card —
		 * treating "wait two seconds" like "this is gone". One line, the page
		 * intact around it, and the rows already loaded still readable.
		 *
		 * ⚠️ A 429 should really RETRY ITSELF on the server's `Retry-After`
		 * rather than asking a person to press a button on its behalf. That
		 * needs the header carried through `presentRequestError`, which does not
		 * expose it yet — recorded rather than bodged.
		 */
		/**
		 * 🔴 A plan limit is an OFFER, not a fault.
		 *
		 * This rendered the error card: a refusal, a request id, and a Try again
		 * that could not work. So the console answered a customer asking to use
		 * MORE of the product — the most welcome sentence a business can hear —
		 * with an apology and a dead end.
		 */
		if (kind === "plan-limit") return <PlanWall detail={it.message} />;

		/**
		 * 🔴 THE RULE: if the page keeps its controls, the failure is INLINE.
		 *
		 * Everything that does not take the page over still has its search box,
		 * its filters and its create button sitting right there — and a big
		 * centred card underneath a live toolbar is neither the page nor a
		 * replacement for it. It reads as a dialog somebody forgot to finish.
		 *
		 * These four all leave the page usable:
		 *   · network     — the wifi blinked; the rows on screen are still true
		 *   · rate-limit  — wait a second and the same request works
		 *   · conflict    — what you have is stale, so refresh and retry
		 *   · invalid     — ONE request was refused; the page is fine
		 *   · timeout     — it ran out of time, or a dependency is busy; both
		 *                   heal themselves, so retrying is the whole answer
		 *
		 * So they get one line where the list would be, and the toolbar above it
		 * still means something. The card is for the states that took the page
		 * away — 404, 403, 500, a plan limit, a module switched off — where
		 * there is no toolbar left to sit under.
		 */
		if (
			kind === "network" ||
			kind === "rate-limit" ||
			kind === "conflict" ||
			kind === "invalid" ||
			kind === "timeout"
		) {
			return (
				<FailureStatusLine
					error={failure}
					onRetry={() => {
						void query.refetch();
					}}
				/>
			);
		}
		/**
		 * 🔴 A disabled module is NOT a failure. Saying "something went wrong"
		 * about it is a lie — nothing broke, the capability simply is not on.
		 *
		 * A soft wall: it says what this does, and offers the one action that
		 * changes the situation. Somebody who does not want it closes the tab;
		 * somebody who does gets a path instead of a dead end.
		 */
		if (isModuleDisabled(failure)) return <ModuleDisabled />;
		if (takesOver)
			return (
				<OutletWall
					failure={failure}
					onRetry={() => {
						void query.refetch();
					}}
				/>
			);
		return (
			<RequestFailure
				error={failure}
				onRetry={() => {
					void query.refetch();
				}}
			/>
		);
	}

	if (query.data === undefined) return null;
	if (empty && isEmpty?.(query.data)) return <>{empty}</>;
	return <>{children(query.data)}</>;
}

/** Matched on the API's error CODE, never on its message — copy changes. */
function isModuleDisabled(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "MODULE_DISABLED"
	);
}

/**
 * A request that failed, said in console language.
 *
 * 🔴 The WORDS come from `presentRequestError`, which classifies by status: a
 * 403 says you lack permission, a 404 says it is gone, a 429 says slow down, a
 * network error says check the connection. "Something went wrong" tells an
 * operator nothing they can act on, and each of those has a different next step.
 *
 * ⚠️ The REQUEST ID is the most useful thing on a broken screen. It turns
 * "orders didn\u2019t load" into a line somebody can find in the logs, and the
 * Connect page already has a lookup that takes one. Selectable on purpose.
 *
 * Deliberately not a red alert box. A failed list is not a warning about
 * something dangerous — it is a thing that did not arrive, and shouting about
 * it in a colour borrowed from another design system made every hiccup look
 * like data loss.
 */
export function RequestFailure({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry?: () => void;
}) {
	/**
	 * 🔴 A disabled MODULE is not a permission failure, and saying so sends
	 * somebody to look at roles for a problem that lives in settings.
	 *
	 * `PageState` already made this distinction, but only inside itself — a page
	 * calling `RequestFailure` directly got the generic 403 wording, which reads
	 * "your account does not have permission" for a workspace that simply has
	 * the capability switched off. Home showed exactly that for revenue, because
	 * the reporting routes are gated on `reporting-analytics` and no workspace has
	 * it enabled.
	 *
	 * The check belongs HERE, in the component that turns an error into words, so
	 * every caller gets it rather than only the ones that went through the
	 * wrapper.
	 */
	if (isModuleDisabled(error)) return <ModuleDisabled />;
	const Variant = FAILURE_VARIANTS[failureStyle()];
	return <Variant error={error} onRetry={onRetry} />;
}

/**
 * Colour carries meaning, so most failures do not get any.
 *
 * 🔴 Only a genuine fault is red. Being told you lack permission, or to slow
 * down, is the workspace working exactly as designed — painting those red
 * teaches people to ignore red. A missing record gets no colour at all, because
 * nothing is broken: the thing simply is not there.
 */
function toneOf(kind: RequestErrorPresentation["kind"]): string {
	/**
	 * 🔴 Offline is AMBER. Not red, not blue.
	 *
	 * Not red, because nothing has broken and nobody is at fault — the machine
	 * lost its network and will get it back, usually in seconds. Red is the
	 * loudest thing this console can say and it belongs to a payment that
	 * failed or a fault in our own system; spending it on a train tunnel is how
	 * people learn to ignore red.
	 *
	 * Not blue either, because blue means "here is something you may want to
	 * know" and this is not optional information — anything typed while it is
	 * showing will not save. Something is at risk, which is exactly what amber
	 * is for.
	 */
	if (kind === "network" || kind === "timeout" || kind === "environment")
		return "var(--signal-attention)";
	if (kind === "server") return "var(--signal-failure)";
	if (kind === "not-found") return "var(--ink-30)";
	// 🔑 A plan limit is an offer, so it takes the calm informational colour
	// rather than the warning one. Amber here would make buying something feel
	// like recovering from a mistake.
	if (kind === "plan-limit") return "var(--signal-news)";
	return "var(--signal-attention)";
}

/**
 * A malformed request is a DATA failure, not a page-level one.
 *
 * The page exists and its controls still mean something; one request was
 * refused. Walling here would strip a working toolbar over a page that is fine.
 */

/** The signal dot, on the same 11px axis as every marker in the sidebar. */
function Dot({ tone }: { tone: string }) {
	return (
		<span className="flex w-[11px] shrink-0 items-center justify-center">
			<span
				aria-hidden="true"
				className="size-1.5 rounded-full"
				style={{ background: tone }}
			/>
		</span>
	);
}

type FailureProps = { error: unknown; onRetry?: () => void };

/**
 * A — the failure occupies the table's own frame.
 *
 * The list did not arrive, so the container the list would have filled says why,
 * in one row, on the grid the table already uses. Nothing new appears on screen:
 * same border, same row height, same gutter.
 */
export function FailureRow({ error, onRetry }: FailureProps) {
	const it = presentRequestError(error);
	return (
		<div
			role="alert"
			className="overflow-hidden rounded-xl border border-[var(--console-line)]"
		>
			<div className="flex h-11 items-center gap-2.5 px-3">
				<Dot tone={toneOf(it.kind)} />
				<span className="shrink-0 text-[12.5px] text-[var(--ink-85)]">
					{it.title}
				</span>
				<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-40)]">
					{it.message}
				</span>
				{it.requestId ? <RequestIdInline id={it.requestId} /> : null}
				{onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						className="shrink-0 text-[11.5px] text-[var(--ink-50)] underline underline-offset-2 transition-colors hover:text-[var(--ink-90)]"
					>
						Try again
					</button>
				) : null}
			</div>
		</div>
	);
}

/**
 * B — one sentence, no box.
 *
 * No container, no stack, no centring. The failure reads as a line of prose
 * where the first row would have been, with the recovery as a link inside the
 * sentence rather than a button parked underneath it.
 */
export function FailureSentence({ error, onRetry }: FailureProps) {
	const it = presentRequestError(error);
	return (
		<div role="alert" className="flex items-baseline gap-2.5 py-2">
			<Dot tone={toneOf(it.kind)} />
			<p className="text-[12.5px] text-[var(--ink-55)] leading-6">
				<span className="text-[var(--ink-85)]">{it.title}.</span> {it.message}{" "}
				{onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						className="text-[var(--ink-85)] underline underline-offset-2 transition-opacity hover:opacity-70"
					>
						Try again
					</button>
				) : null}
				{it.requestId ? <RequestIdInline id={it.requestId} /> : null}
			</p>
		</div>
	);
}

/**
 * C — a status line, in the product's own register.
 *
 * QuickDash is a backend. A monospace line reporting the status, the condition
 * and the request id is the vocabulary its operators already read in logs, and
 * it takes one row of height instead of a panel.
 */
export function FailureStatusLine({ error, onRetry }: FailureProps) {
	const it = presentRequestError(error);
	const toast = useToast();

	/**
	 * 🔑 A transient failure says it TWICE, in two different registers.
	 *
	 * The line explains why this list is stale. The toast explains that the
	 * problem is bigger than this list — a throttle applies to the whole
	 * account, so the next page will do the same thing, and somebody who
	 * navigates away needs to know that before they blame the next screen.
	 *
	 * 🔴 The rule that decides who gets a toast: the fact is bigger than the
	 * page. A 404, a 500 or a 403 is about the page in front of you and the page
	 * is already saying it — toasting as well is the console repeating itself in
	 * the corner.
	 *
	 * ⚠️ A fixed id, so a screen running five queries against a throttled API
	 * raises one notice rather than five identical ones.
	 *
	 * ⚠️ Offline is toasted from BOTH here and `ConnectionBanner`, under one
	 * shared id, so they collapse rather than duplicate. The banner is what
	 * clears it — a failed query only ever sees the failure, never the recovery.
	 */
	const kind = it.kind;
	useEffect(() => {
		if (kind === "rate-limit") {
			toast.show({
				id: TRANSIENT_TOAST.rateLimit,
				signal: "attention",
				title: "Slow down a moment",
				body: "QuickDash is throttling requests from this account. It will clear on its own.",
			});
		}
		if (kind === "network") {
			toast.show({
				// 🔑 The SAME id `ConnectionBanner` uses. Both notice the same
				// disconnect — one from the window's event, one from a request that
				// did not come back — and sharing the id means they collapse into a
				// single toast instead of two saying the same thing. It also lets
				// the banner dismiss this one the moment the connection returns,
				// which a failed query could never do on its own.
				id: TRANSIENT_TOAST.offline,
				// Amber. See `toneOf`: not a failure, but not merely news either —
				// nothing typed while it shows will save.
				signal: "attention",
				title: "You’re offline",
				body: "Changes won’t save until you reconnect.",
			});
		}
	}, [kind, toast]);

	return (
		/* 🔴 No monospace. This was a status code, a request id and a lowercase
		   "retry" all in mono, which reads as a terminal transcript pasted into
		   the console — a different typeface saying a different product. The
		   console has one voice; a failure does not get to speak in another.
		   The status code is gone with it, for the same reason it left the error
		   card: it names nothing the sentence beside it does not. */
		<div
			role="alert"
			className="flex h-9 items-center gap-2.5 rounded-lg bg-[rgb(var(--console-ink)/0.035)] px-3"
		>
			<Dot tone={toneOf(it.kind)} />
			<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-60)]">
				{it.message}
			</span>
			{it.requestId ? <RequestIdInline id={it.requestId} /> : null}
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="-mr-1 shrink-0 rounded-md px-2 py-1 text-[11.5px] text-[var(--ink-50)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]"
				>
					Retry
				</button>
			) : null}
		</div>
	);
}

/**
 * The shipped treatment: an EmptyState-shaped panel.
 *
 * Title, one line of explanation, then the recovery — the same rhythm and the
 * same box as an empty list, so a page that failed and a page with nothing in it
 * feel like the same product rather than two different ones.
 *
 * The signal dot is the only colour, and it earns its place: it is what
 * separates this at a glance from the empty state it deliberately resembles.
 */
export function FailurePanel({ error, onRetry }: FailureProps) {
	const it = presentRequestError(error);
	return (
		/* 🔑 The SAME card the route boundary uses, in the space the list would
		   have filled. It used to be a bordered box with centred grey text, a
		   pill button and a bare request id sitting underneath like a footnote —
		   a different design for the same fault, and the one people actually
		   meet. One card, two entry points. */
		<div role="alert" className="flex justify-center py-6">
			<ErrorCard
				title={it.title}
				detail={it.message}
				requestId={it.requestId}
				action={
					onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							/* The console's rectangular primary: 32px, 6px radius, ink
							   fill. The pill it used to be belonged to no other button
							   in QuickDash. */
							className="inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90"
						>
							Try again
						</button>
					) : null
				}
			/>
		</div>
	);
}

export const FAILURE_VARIANTS = {
	panel: FailurePanel,
	row: FailureRow,
	sentence: FailureSentence,
	status: FailureStatusLine,
} as const;

export type FailureStyle = keyof typeof FAILURE_VARIANTS;

/**
 * Which treatment ships.
 *
 * 🔴 The same container the EMPTY state uses, in the same place, with the page's
 * layout left completely alone. "No orders yet" and "orders could not load" are
 * the two things that can occupy an empty list, and they should sit in the same
 * frame — the words tell them apart, not a different shape in a different place.
 *
 * ⚠️ Nothing is withdrawn from the page. The search box, the filters and the
 * header action stay exactly where they were, because moving the furniture
 * around somebody at the moment something breaks is its own small hostility.
 */
const CHOSEN_STYLE: FailureStyle = "panel";

/**
 * Development only: `?style=row|sentence|status` on any module page.
 *
 * 🔑 Read straight off `window.location` rather than through the router. This is
 * a review switch, not product state — routing it through search-param schemas
 * would put a temporary thing into every page's contract.
 */
function failureStyle(): FailureStyle {
	if (!import.meta.env.DEV) return CHOSEN_STYLE;
	const asked = new URLSearchParams(window.location.search).get("style");
	return asked && asked in FAILURE_VARIANTS
		? (asked as FailureStyle)
		: CHOSEN_STYLE;
}

/**
 * Development only: force a failure so error states can be reviewed in place.
 *
 * 🔴 Reviewing an error state used to mean manufacturing a real 403 against a
 * running API, so nobody reviewed them and every page drifted. `?fail=403` on
 * any module page renders that page's real failure state, in its real
 * surroundings — header, crumb, action button and all — which a gallery on its
 * own page cannot show.
 *
 * Accepts a status, `offline`, or `disabled`. Stripped from production builds.
 */
export function forcedFailure(): unknown {
	if (!import.meta.env.DEV) return null;
	const asked = new URLSearchParams(window.location.search).get("fail");
	if (!asked) return null;
	if (asked === "offline") return new TypeError("Failed to fetch");
	if (asked === "disabled") return { code: "MODULE_DISABLED" };
	// Environment refusals are matched on their CODE, not a status, so they
	// cannot be reached by number like the rest.
	if (asked === "locked")
		return Object.assign(new Error("ENVIRONMENT_LOCKED"), {
			status: 409,
			code: "ENVIRONMENT_LOCKED",
			requestId: "3f2b91c4-8d17-4a6e-9c05-1b7e2d4a8f60",
		});
	if (asked === "mode")
		return Object.assign(new Error("ENVIRONMENT_MISMATCH"), {
			status: 409,
			code: "ENVIRONMENT_MISMATCH",
			requestId: "3f2b91c4-8d17-4a6e-9c05-1b7e2d4a8f60",
		});
	const status = Number(asked);
	if (!Number.isFinite(status)) return null;
	return Object.assign(new Error(`HTTP ${status}`), {
		status,
		requestId: "3f2b91c4-8d17-4a6e-9c05-1b7e2d4a8f60",
	});
}

/**
 * Nothing here yet, said in a way that helps.
 *
 * 🔑 Separate from a FAILURE on purpose. "No orders yet" and "orders could not
 * load" look similar on screen and mean opposite things: one is a healthy shop
 * waiting for its first sale, the other is something broken. Conflating them is
 * how a business stares at an empty page believing it is fine.
 */
export function EmptyState({
	title,
	detail,
	action,
}: {
	title: string;
	detail?: string;
	action?: ReactNode;
}) {
	return (
		<div className="rounded-xl border border-[var(--console-line-soft)] px-4 py-8 text-center">
			<p className="text-[12.5px] text-[var(--ink-60)]">{title}</p>
			{detail ? (
				<p className="mx-auto mt-1 max-w-sm text-[11.5px] text-[var(--ink-30)] leading-5">
					{detail}
				</p>
			) : null}
			{action ? <div className="mt-3">{action}</div> : null}
		</div>
	);
}

/** A short failure line for places a full error block would dominate. */
export function inlineFailure(error: unknown): string {
	return presentRequestError(error).message;
}

/**
 * A row acting on itself.
 *
 * 🔴 Scoped to the row, not the list. `mutation.isPending` is true for the whole
 * table, so using it directly dims every Publish button when one was pressed —
 * which reads as the page freezing rather than as one thing working. Comparing
 * against the id being mutated is what makes it local.
 *
 * ⚠️ The sweep goes on the CONTROL, never the row. A whole row shimmering looks
 * like its data is reloading, which is a different claim from "the button you
 * pressed is working".
 */
export function rowBusy(
	mutation: { isPending: boolean; variables?: unknown },
	id: string,
): boolean {
	if (!mutation.isPending) return false;
	const variables = mutation.variables;
	if (typeof variables === "string") return variables === id;
	if (variables && typeof variables === "object" && "id" in variables) {
		return (variables as { id?: unknown }).id === id;
	}
	return false;
}

// ── Page-level walls ─────────────────────────────────────────────────────────

/**
 * The same wall, filling the viewport, for when the whole app has failed.
 *
 * 🔴 Not `StatusScreen` from the shared UI package. That wraps its content in
 * the AUTH shell, so a crash inside the console rendered the sign-in wordmark
 * and a letter-spaced "ERROR" over a page that has nothing to do with signing
 * in. This keeps the console's own background and its own left edge.
 */
export function FullPageWall({
	title,
	detail,
	action,
	requestId,
	tone = "var(--ink-30)",
}: {
	title: string;
	detail: string;
	action?: ReactNode;
	/** Carried through on a server fault: it is the line support can look up. */
	requestId?: string | null;
	tone?: string;
}) {
	return (
		/**
		 * 🔴 `fixed inset-0`, NOT a tall block.
		 *
		 * This is rendered from inside a module page, which sits inside the
		 * workspace layout — so a full-height element still leaves the sidebar,
		 * the header and the crumb on screen around it. That is precisely the
		 * confusion this screen exists to remove: a console that looks operable
		 * behind a message saying you are signed out.
		 *
		 * Taking the viewport puts the whole application behind it, which is the
		 * honest picture when nothing on screen is current any more.
		 */
		<main className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-[var(--console-bg)] px-8">
			<Wall
				tone={tone}
				title={title}
				detail={detail}
				action={action}
				requestId={requestId}
			/>
		</main>
	);
}

function Wall({
	tone,
	title,
	detail,
	action,
	requestId,
}: {
	tone: string;
	title: string;
	detail: string;
	action?: ReactNode;
	requestId?: string | null;
}) {
	return (
		/**
		 * ⚠️ Centred, not left-aligned. Dense left-aligned text is right for a
		 * panel sitting inside a working page, and wrong for a screen that has
		 * taken the whole area over: there is no column of content for it to line
		 * up with, so it reads as pinned to the corner of an empty space.
		 */
		<div
			role="alert"
			className="flex min-h-[52vh] flex-col items-center justify-center text-center"
		>
			{/* The dot carries the tone; the code was a mono string doing the same
			    job in a typeface the console does not otherwise use. */}
			<span
				aria-hidden="true"
				className="size-1.5 rounded-full"
				style={{ background: tone }}
			/>
			<h2 className="mt-3 text-[15px] text-[var(--ink-90)]">{title}</h2>
			<p className="mt-1.5 max-w-sm text-[12px] text-[var(--ink-45)] leading-6">
				{detail}
			</p>
			{action ? <div className="mt-5">{action}</div> : null}
			{/* Copyable, like every other request id. See `RequestIdInline`. */}
			{requestId ? (
				<div className="mt-7">
					<RequestIdInline id={requestId} />
				</div>
			) : null}
		</div>
	);
}

/**
 * The session ended, said at the size of the problem.
 *
 * Takes over the viewport because the console behind it is stale, and offers the
 * only action that resolves it. The redirect carries `reason=expired` and a
 * return address, matching what the root route already sends, so signing in
 * lands back on the page somebody was actually working on.
 */
function SessionEnded() {
	const back = () => {
		const target = new URL("/signin", clientEnv.AUTH_URL);
		target.searchParams.set("redirect", window.location.href);
		target.searchParams.set("reason", "expired");
		window.location.assign(target.toString());
	};
	return (
		/**
		 * 🔑 The ONE error that is genuinely a modal.
		 *
		 * Everywhere else a dialog is wrong because the page behind it never
		 * loaded — there is nothing to return to. Here the console behind IS
		 * rendered: the sidebar, the counts, the rows, all of it drawn from a
		 * session that has stopped existing. It is not missing, it is STALE, and
		 * stale is the one thing a person cannot tell by looking.
		 *
		 * So it blocks rather than replaces, and the blur says why: everything
		 * behind this is a photograph of a minute ago. Nothing back there can be
		 * clicked, because every click would fail the same way.
		 */
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0/0.35)] px-5 backdrop-blur-[3px]"
		>
			<ErrorCard
				title="Your session ended"
				detail="You have been signed out, so nothing on this page is current any more. Sign in again and you will come straight back here."
				action={
					<button
						type="button"
						onClick={back}
						className="inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90"
					>
						Sign in again
					</button>
				}
			/>
		</div>
	);
}

// ── Page-level takeovers ────────────────────────────────────────────────────

/**
 * Which failures leave the page with nothing to operate on.
 *
 * 🔴 The test is "is there anything here to search, filter or act on", NOT
 * severity. A 500 is the most serious status a list can return and is
 * deliberately absent: the page exists, its filters still describe what a retry
 * would fetch, and taking the screen away would hide working controls over a
 * fault that is very likely momentary.
 *
 * A 404 is the mild one and belongs here, because there is no list to search.
 */
/**
 * Whether the page has nothing left to operate on.
 *
 * 🔑 A takeover withdraws the PAGE's own controls — search, filters, Export,
 * the create button — while leaving the console shell alone. That is the honest
 * shape for these four: searching a list that could not load, or filtering one
 * that does not exist, are offers the page cannot keep.
 *
 * 🔴 `server` added 2026-09-03. A 500 left the toolbar sitting above an error
 * card, so the page invited you to search and filter nothing. It blocks the
 * page, not the console: the sidebar stays, and navigating away still works.
 *
 * ⚠️ Callers pass `skeleton="panel"` to opt out. A detail panel that 404s has
 * lost one record, not the list behind it.
 */
function isTakeoverFailure(error: unknown): boolean {
	if (!error) return false;
	if (isModuleDisabled(error)) return true;
	const kind = presentRequestError(error).kind;
	return (
		kind === "not-found" ||
		kind === "permission" ||
		kind === "server" ||
		kind === "environment"
	);
}

/**
 * The outlet, taken over.
 *
 * ⚠️ Fills the CONTENT area only. The sidebar and the header stay, because the
 * console is fine and only this page is not — throwing somebody out of the
 * dashboard over a bad address is worse than the address being bad. Contrast
 * `FullPageWall`, used when the session itself is gone.
 */
function OutletWall({
	failure,
	onRetry,
}: {
	failure: unknown;
	onRetry?: () => void;
}) {
	const it = presentRequestError(failure);
	const kind = it.kind;

	/**
	 * 🔴 ONE 404 in this console, whichever way you reach it.
	 *
	 * A mistyped address and a record that has been deleted are the same fact to
	 * the person reading, but they arrive by different routes — the router's
	 * not-found boundary, and a query answering 404 — and each had grown its own
	 * screen. One showed the address you tried, a ⌘K hint and Back to Home; the
	 * other said "Go back" and nothing else. Rendering the real component here
	 * makes divergence impossible rather than merely discouraged.
	 */
	if (kind === "not-found") return <OutletNotFound />;

	/**
	 * The only error whose way out is a SWITCH. See `EnvironmentWall`.
	 */
	if (kind === "environment") {
		return (
			<div className="flex min-h-full items-center justify-center px-5 py-16">
				<EnvironmentWall detail={it.message} title={it.title} />
			</div>
		);
	}

	/**
	 * Permission gets its own card, because it is the one refusal with a person
	 * on the other end of it. See `NoAccess`.
	 */
	if (kind === "permission") {
		return (
			<div className="flex min-h-full items-center justify-center px-5 py-16">
				<NoAccess detail={it.message} action={<GoBack />} />
			</div>
		);
	}

	return (
		/* 🔴 The SAME `ErrorCard` as everywhere else. This was a THIRD error
		   design — after the boundary's and the panel's — and adding `server` to
		   the takeover rule routed the 500 straight into it, which is why a card
		   that had just been restyled appeared to revert. Three components drew
		   the same fault three ways; now one does. */
		<div className="flex min-h-full items-center justify-center px-5 py-16">
			<ErrorCard
				title={it.title}
				detail={it.message}
				requestId={it.requestId}
				action={
					<>
						{/* 🔑 Retry only where retrying can work. On a 403 or a 404 the
						    next attempt fails identically, and a button that cannot
						    succeed teaches people the buttons do not work. */}
						{onRetry && kind === "server" ? (
							<button
								type="button"
								onClick={onRetry}
								className="inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90"
							>
								Try again
							</button>
						) : null}
						<GoBack />
					</>
				}
			/>
		</div>
	);
}

/**
 * A module that is switched off — a soft wall, not a failure.
 *
 * 🔴 Links to THIS workspace's own management page, not the workspace list.
 * Landing somebody on a list of workspaces and leaving them to find the right
 * one, then find the module switch, is how an upgrade path becomes a dead end.
 * `/workspaces/{slug}` is where modules are actually toggled.
 *
 * Hard rule 4 is explicit that this is product work: telling your own users what
 * your own product does is the product, not advertising.
 */
function ModuleDisabled() {
	// Loose params: `PageState` is used by pages at several depths, and every one
	// of them sits under `/$workspace`.
	const params = useParams({ strict: false }) as { workspace?: string };
	const manage = params.workspace
		? `${clientEnv.ACCOUNT_URL}/workspaces/${encodeURIComponent(params.workspace)}`
		: `${clientEnv.ACCOUNT_URL}/workspaces`;
	return (
		/* 🔑 The same card as every other state, rather than the bare centred
		   wall it used to be. Nothing has gone wrong here — a capability is off
		   — but "nothing went wrong" is not a reason to look like a different
		   product. */
		<div className="flex min-h-full items-center justify-center px-5 py-16">
			<ErrorCard
				title="This module is switched off"
				detail="It is part of QuickDash and it is not turned on for this workspace. Switching it on adds it to the sidebar with everything you already have, and nothing else changes."
				action={
					<>
						<a
							href={manage}
							className="inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] no-underline transition-opacity hover:opacity-90"
						>
							Turn it on
						</a>
						<a
							href={
								params.workspace
									? `/${encodeURIComponent(params.workspace)}`
									: "/"
							}
							className="inline-flex h-8 items-center rounded-md border border-[var(--console-line-strong)] px-3 text-[12px] text-[var(--ink-60)] no-underline transition-colors hover:text-[var(--ink-90)]"
						>
							Not now
						</a>
					</>
				}
			/>
		</div>
	);
}

/**
 * A write that failed, said the same way a read that failed is said.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Reading and writing failed in two completely different visual languages.
 * A list that could not load got a bordered panel; a save that was refused got
 * a bare line of text floating under the controls, in twenty four separate
 * views that each wrote their own. So the console looked considered when
 * nothing happened and slapdash the moment somebody tried to do something —
 * which is exactly backwards, because a refused save is the one they care about.
 *
 * ⚠️ Not the same component as `FailurePanel`, deliberately. A failed READ
 * replaces content that never arrived and can occupy the space. A failed WRITE
 * sits above a form that is still there and still correct, so it must be
 * compact enough not to shove the thing being fixed off the screen.
 */
/**
 * A page you can read and cannot change, and the reason why.
 *
 * 🔴 A screen with no create button and no editable field looks BROKEN, or
 * looks like a permission you are missing. Purchase orders is the clearest
 * case: they are raised automatically when an order is paid, and inventing one
 * by hand would ask a supplier for goods nobody bought. That is a deliberate
 * and defensible design — and until now the only place it was written down was
 * a comment in the source, where no operator will ever read it.
 *
 * ⚠️ This is for records the SYSTEM owns, not for a role that lacks
 * permission. That one is `NoAccess`, and it has somebody to ask; this one has
 * nobody, because the answer is "nothing is wrong".
 */
/**
 * What you are reading is real, and may have moved on.
 *
 * 🔑 Says WHEN, not just that something failed. "Could not refresh" invites the
 * question "so how old is this", and a list of orders is exactly the place that
 * question matters — somebody is about to act on a total or a stock level.
 *
 * ⚠️ Sits ABOVE the content rather than replacing it, and takes the same shape
 * as every other inline failure. Nothing is withdrawn: the search, the filters
 * and the rows all still work, because they are all still true.
 */
export function StaleNotice({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	const it = presentRequestError(error);
	return (
		<div
			role="status"
			className="mb-3 flex items-center gap-2.5 rounded-lg bg-[rgb(var(--console-ink)/0.035)] px-3 py-2"
		>
			<Dot tone="var(--signal-attention)" />
			<span className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-55)]">
				This did not refresh, so it may be out of date.
			</span>
			{it.requestId ? <RequestIdInline id={it.requestId} /> : null}
			<button
				type="button"
				onClick={onRetry}
				className="-mr-1 shrink-0 rounded-md px-2 py-1 text-[11.5px] text-[var(--ink-50)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]"
			>
				Retry
			</button>
		</div>
	);
}

export function ReadOnlyNote({ children }: { children: ReactNode }) {
	return (
		<p className="mb-3 flex items-start gap-2.5 rounded-xl border border-[var(--console-line)] px-3 py-2.5 text-[11.5px] text-[var(--ink-45)] leading-5">
			<span
				aria-hidden="true"
				className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--signal-news)]"
			/>
			<span className="min-w-0 flex-1">{children}</span>
		</p>
	);
}

export function WriteFailure({
	error,
	message,
}: {
	/** The failure itself. Preferred — it carries the status and request id. */
	error?: unknown;
	/** Legacy: a message already turned into a string by the caller. */
	message?: string;
}) {
	const it = error === undefined ? null : presentRequestError(error);

	/**
	 * 🔑 The API's OWN words when it has any, ours when it does not.
	 *
	 * `presentRequestError` deliberately refuses to echo API messages, because
	 * a last-resort screen must never leak an unreviewed provider or parser
	 * error. That is right for a wall and wrong here: a save failure is exactly
	 * where the route's reviewed copy belongs — "That payment provider is not
	 * connected" beats "Something went wrong" every time.
	 *
	 * A DomainError is recognisable by carrying a `code`, and its message has
	 * been written for a person. Anything else falls back to our own wording,
	 * which is what stops a raw `HTTP 500` reaching the screen — the exact bug
	 * this replaced.
	 */
	const domain =
		error && typeof error === "object" && "code" in error
			? ((error as { message?: string }).message ?? null)
			: null;
	const text = domain ?? it?.message ?? message ?? "That did not save.";

	return (
		<div
			role="alert"
			className="mb-3 flex items-start gap-2.5 rounded-xl border border-[var(--console-line)] px-3 py-2.5"
		>
			<span
				aria-hidden="true"
				className="mt-[5px] size-1.5 shrink-0 rounded-full"
				style={{ background: toneOf(it?.kind ?? "server") }}
			/>
			<div className="min-w-0 flex-1">
				<p className="text-[11.5px] text-[var(--ink-60)] leading-5">{text}</p>
				{/* Mandatory wherever a request id exists — see `RequestIdInline`.
				    A save that failed is the single most likely thing somebody
				    quotes to support. */}
				{/* A failed SAVE is the single most likely thing anybody quotes to
				    support, so the id and the way to send it sit together. */}
				{it?.requestId ? (
					<div className="-ml-1.5 mt-1 flex flex-wrap items-center gap-1">
						<RequestIdInline id={it.requestId} />
						<ContactSupport requestId={it.requestId} />
					</div>
				) : null}
			</div>
		</div>
	);
}
