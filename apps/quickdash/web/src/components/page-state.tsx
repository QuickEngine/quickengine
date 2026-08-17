import { presentRequestError } from "@quickengine/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { clientEnv } from "../lib/env";
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
	// `isPending && !data` rather than `isPending`: a query holding placeholder
	// data from a previous fetch must keep showing it. Flashing a skeleton over
	// content that is already correct reads as the page breaking.
	if (query.isPending && query.data === undefined) {
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

	if (query.isError) {
		/**
		 * 🔴 A disabled module is NOT a failure. Saying "something went wrong"
		 * about it is a lie — nothing broke, the capability simply is not on.
		 *
		 * A soft wall: it says what this does, and offers the one action that
		 * changes the situation. Somebody who does not want it closes the tab;
		 * somebody who does gets a path instead of a dead end.
		 */
		if (isModuleDisabled(query.error)) {
			return (
				<EmptyState
					title="Not switched on yet"
					detail="This part of QuickDash is not enabled for this workspace. Turn it on and it appears in the sidebar with everything else."
					action={
						<a
							href={`${clientEnv.ACCOUNT_URL}/workspaces`}
							className="inline-flex h-8 items-center rounded-full bg-[rgb(var(--console-ink))] px-3.5 text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
						>
							Turn it on
						</a>
					}
				/>
			);
		}
		return (
			<RequestFailure
				error={query.error}
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
	const presentation = presentRequestError(error);
	return (
		<div
			role="alert"
			className="rounded-xl border border-[var(--console-line-strong)] px-4 py-6"
		>
			<p className="text-[12.5px] text-[var(--ink-85)]">{presentation.title}</p>
			<p className="mt-1 max-w-md text-[11.5px] text-[var(--ink-45)] leading-5">
				{presentation.message}
			</p>
			<div className="mt-3 flex items-center gap-3">
				{onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						className="inline-flex h-7 items-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
					>
						Try again
					</button>
				) : null}
				{presentation.requestId ? (
					<p className="text-[10.5px] text-[var(--ink-30)]">
						Request ID{" "}
						<code className="select-all font-mono text-[var(--ink-45)]">
							{presentation.requestId}
						</code>
					</p>
				) : null}
			</div>
		</div>
	);
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
