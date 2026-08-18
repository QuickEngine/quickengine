import {
	presentRequestError,
	type RequestErrorPresentation,
} from "@quickengine/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { clientEnv } from "../lib/env";
import { useDeclareTakeover } from "./header-action";
import { SkeletonPanel, SkeletonRows } from "./skeletons";

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
	const forced = forcedFailure();
	const failure = forced ?? (query.isError ? query.error : null);

	/**
	 * 🔴 Only a page's PRIMARY content declares a takeover.
	 *
	 * A detail panel that 404s has lost one record, not the page — taking over on
	 * its behalf would strip the list's search and filters because the thing you
	 * clicked has gone. Panels identify themselves with `skeleton="panel"`.
	 */
	const takesOver = skeleton !== "panel" && isTakeoverFailure(failure);
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
		const kind = presentRequestError(failure).kind;
		if (kind === "authentication") return <SessionEnded />;
		/**
		 * 🔴 A fault in the API, or no API at all, takes the whole screen.
		 *
		 * Neither is a property of THIS page: if the server is failing or
		 * unreachable, the sidebar counts are stale, the bell is stale, and every
		 * other page would fail identically. Leaving somebody inside a console
		 * that looks operable invites them to try five more pages and meet the
		 * same wall five more times.
		 *
		 * ⚠️ Retry is the action, not sign-in — nothing is wrong with the session.
		 */
		if (kind === "server" || kind === "network") {
			return (
				<FullPageFailure
					failure={failure}
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
		if (takesOver) return <OutletWall failure={failure} />;
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
	if (kind === "network" || kind === "server") return "var(--signal-failure)";
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
				{it.requestId ? (
					<code className="hidden shrink-0 font-mono text-[10.5px] text-[var(--ink-25)] lg:block">
						{it.requestId.slice(0, 8)}
					</code>
				) : null}
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
				{it.requestId ? (
					<span className="ml-2 font-mono text-[10.5px] text-[var(--ink-25)]">
						{it.requestId.slice(0, 8)}
					</span>
				) : null}
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
	return (
		<div
			role="alert"
			className="flex h-9 items-center gap-3 rounded-lg bg-[rgb(var(--console-ink)/0.035)] px-2.5"
		>
			<Dot tone={toneOf(it.kind)} />
			<code
				className="shrink-0 font-mono text-[11px]"
				style={{ color: toneOf(it.kind) }}
			>
				{it.code}
			</code>
			<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-50)]">
				{it.message}
			</span>
			{it.requestId ? (
				<code className="hidden shrink-0 font-mono text-[10.5px] text-[var(--ink-25)] md:block">
					{it.requestId}
				</code>
			) : null}
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="shrink-0 font-mono text-[11px] text-[var(--ink-50)] transition-colors hover:text-[var(--ink-90)]"
				>
					retry
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
		<div
			role="alert"
			className="rounded-xl border border-[var(--console-line-soft)] px-4 py-8 text-center"
		>
			<p className="flex items-center justify-center gap-2 text-[12.5px] text-[var(--ink-60)]">
				<span
					aria-hidden="true"
					className="size-1.5 shrink-0 rounded-full"
					style={{ background: toneOf(it.kind) }}
				/>
				{it.title}
			</p>
			<p className="mx-auto mt-1 max-w-sm text-[11.5px] text-[var(--ink-30)] leading-5">
				{it.message}
			</p>
			{onRetry ? (
				<div className="mt-3">
					<button
						type="button"
						onClick={onRetry}
						className="inline-flex h-8 items-center rounded-full border border-[var(--console-line-strong)] px-3.5 text-[12px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
					>
						Try again
					</button>
				</div>
			) : null}
			{it.requestId ? (
				<p className="mt-3 font-mono text-[10.5px] text-[var(--ink-25)]">
					{it.requestId}
				</p>
			) : null}
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
	code,
	title,
	detail,
	action,
	requestId,
	tone = "var(--ink-30)",
}: {
	code: string;
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
				code={code}
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
	code,
	tone,
	title,
	detail,
	action,
	requestId,
}: {
	code: string;
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
			<code className="font-mono text-[11px] lowercase" style={{ color: tone }}>
				{code}
			</code>
			<h2 className="mt-2.5 text-[15px] text-[var(--ink-90)]">{title}</h2>
			<p className="mt-1.5 max-w-sm text-[12px] text-[var(--ink-45)] leading-6">
				{detail}
			</p>
			{action ? <div className="mt-5">{action}</div> : null}
			{requestId ? (
				<p className="mt-7 font-mono text-[10.5px] text-[var(--ink-25)]">
					{requestId}
				</p>
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
		<FullPageWall
			code="signed out"
			tone="var(--signal-attention)"
			title="Your session ended"
			detail="You have been signed out, so nothing on this page is current any more. Sign in again and you will come straight back here."
			action={
				<button
					type="button"
					onClick={back}
					className="inline-flex h-9 items-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
				>
					Sign in again
				</button>
			}
		/>
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
function isTakeoverFailure(error: unknown): boolean {
	if (!error) return false;
	if (isModuleDisabled(error)) return true;
	const kind = presentRequestError(error).kind;
	return kind === "not-found" || kind === "permission";
}

/**
 * The outlet, taken over.
 *
 * ⚠️ Fills the CONTENT area only. The sidebar and the header stay, because the
 * console is fine and only this page is not — throwing somebody out of the
 * dashboard over a bad address is worse than the address being bad. Contrast
 * `FullPageWall`, used when the session itself is gone.
 */
function OutletWall({ failure }: { failure: unknown }) {
	const it = presentRequestError(failure);
	return (
		<Wall
			code={it.code}
			tone={toneOf(it.kind)}
			title={it.title}
			detail={it.message}
			requestId={it.requestId}
			action={
				// 🔴 Only the action that can actually help. "Try again" on a 403
				// invites somebody to press a button that cannot succeed.
				<button
					type="button"
					onClick={() => window.history.back()}
					className="inline-flex h-9 items-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
				>
					Go back
				</button>
			}
		/>
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
		<Wall
			code="not enabled"
			tone="var(--ink-30)"
			title="This module is switched off"
			detail="It is part of QuickDash and it is not turned on for this workspace. Switching it on adds it to the sidebar with everything you already have, and nothing else changes."
			action={
				<a
					href={manage}
					className="inline-flex h-9 items-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
				>
					Turn it on
				</a>
			}
		/>
	);
}

/**
 * The API failed, or could not be reached at all.
 *
 * Full viewport, because the fault is the server's rather than this page's, and
 * every other page in the console would meet exactly the same wall.
 */
function FullPageFailure({
	failure,
	onRetry,
}: {
	failure: unknown;
	onRetry: () => void;
}) {
	const it = presentRequestError(failure);
	return (
		<FullPageWall
			code={it.code}
			tone={toneOf(it.kind)}
			title={it.title}
			detail={it.message}
			requestId={it.requestId}
			action={
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex h-9 items-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
				>
					Try again
				</button>
			}
		/>
	);
}
