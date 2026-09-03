"use client";

import { Copy, WarningCircle } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import { primaryButton, StatusScreen, subtleButton } from "./auth-ui";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

type RequestErrorLike = Error & {
	code?: string;
	status?: number;
	requestId?: string | null;
};

export type RequestErrorPresentation = {
	code: string;
	title: string;
	message: string;
	requestId: string | null;
	kind:
		| "authentication"
		| "permission"
		| "not-found"
		| "conflict"
		| "rate-limit"
		| "network"
		| "invalid"
		| "plan-limit"
		| "environment"
		| "timeout"
		| "server";
};

const isRequestErrorLike = (error: unknown): error is RequestErrorLike =>
	error instanceof Error;

/**
 * Convert SDK and browser failures into safe customer-facing recovery copy.
 *
 * API messages are deliberately not echoed here: route boundaries can receive an
 * unexpected provider or parsing error, and a last-resort screen must never leak it.
 * Inline form errors remain the right place for a route's already-reviewed validation copy.
 */
export function presentRequestError(error: unknown): RequestErrorPresentation {
	const candidate = isRequestErrorLike(error) ? error : null;
	const status = candidate?.status;
	const requestId =
		typeof candidate?.requestId === "string" && candidate.requestId.length > 0
			? candidate.requestId
			: null;

	/**
	 * 🔴 400 used to fall through to "Something went wrong".
	 *
	 * Every other status here earns specific copy, and the one that means "the
	 * request itself was wrong" got the shrug. It is not a rare case either: a
	 * route registered behind a parameter route answers 400 because a path
	 * segment fails uuid parsing, and that fault reached production twice while
	 * the console said nothing useful about it.
	 *
	 * The copy does NOT tell an operator to fix their input, because most 400s
	 * they will ever see are not their doing. It says what is known — the request
	 * was refused as malformed — and points at the request id, which is the thing
	 * that actually resolves it.
	 */
	if (status === 400 || status === 422) {
		return {
			code: String(status),
			title: "QuickDash couldn't make sense of that request",
			message:
				"The request was refused before it ran, so nothing was changed. If you did not just type something unusual, quote the request ID.",
			requestId,
			kind: "invalid",
		};
	}
	/**
	 * 🔴 402 is an OFFER, not a fault.
	 *
	 * The API answers `USAGE_LIMIT_EXCEEDED` with 402 when an account has spent
	 * what its plan includes — inviting a member past the seat count, creating a
	 * workspace past the allowance. Nothing broke and nothing was typed wrong, so
	 * the generic "something went wrong" was actively misleading: it sent people
	 * to debug a failure that was really a decision.
	 *
	 * ⚠️ The API's own message names the specific limit and how to clear it, so
	 * the caller shows THAT rather than this text. This exists so a 402 can be
	 * told apart from a fault at all, and so nothing paints it red.
	 */
	if (status === 402) {
		return {
			code: "402",
			title: "That needs a larger plan",
			/**
			 * 🔑 Leads with the business, not the ceiling.
			 *
			 * "Your plan's allowance for this is used up" is an accountant's
			 * sentence — it opens on the limit and makes growth sound like an
			 * error somebody made. Running out of allowance means the workspace
			 * is being used, which is the good news in the sentence.
			 */
			message:
				"You have used everything this plan includes for that, which usually means things are going well. A larger plan lifts it straight away, or you can free some allowance instead.",
			requestId,
			kind: "plan-limit",
		};
	}
	if (status === 401) {
		return {
			code: "401",
			title: "Your session ended",
			message: "Sign in again, then return to the page you were working on.",
			requestId,
			kind: "authentication",
		};
	}
	if (status === 403) {
		return {
			code: "403",
			title: "You don't have access",
			/**
			 * 🔑 Says whose decision it is, not just that the answer is no.
			 *
			 * "Your account does not have permission to view or change this
			 * workspace resource" reads like a policy notice: it restates the
			 * refusal in longer words, names nothing anybody can act on, and
			 * "resource" is a word for the people who built the API rather than
			 * the person who just clicked a link.
			 */
			message:
				"Your role in this workspace cannot open this page. Someone who manages the workspace can change that.",
			requestId,
			kind: "permission",
		};
	}
	if (status === 404) {
		return {
			code: "404",
			title: "This resource wasn't found",
			message:
				"It may have been moved, removed, or belong to a different workspace.",
			requestId,
			kind: "not-found",
		};
	}
	/**
	 * 🔴 Matched on the CODE, not the status.
	 *
	 * Environment refusals answer 409, so they were being described as
	 * conflicts — "this changed before we could finish", which is a story about
	 * timing and stale data. Nothing changed and nothing is stale: this
	 * workspace is in one mode and the thing being asked for belongs to the
	 * other. Telling somebody to refresh and retry sends them round a loop that
	 * cannot end, because retrying is not what fixes it.
	 *
	 * ⚠️ Its own kind because the WAY OUT is different from every other error.
	 * Not retry, not go back, not upgrade — switch mode, or accept that this
	 * workspace has taken real money and never can.
	 */
	const code = candidate && "code" in candidate ? String(candidate.code) : "";
	if (
		code === "ENVIRONMENT_LOCKED" ||
		code === "ENVIRONMENT_MISMATCH" ||
		code === "PAYMENT_ENVIRONMENT_MISMATCH"
	) {
		return {
			code: "environment",
			title:
				code === "ENVIRONMENT_LOCKED"
					? "This workspace is locked to its mode"
					: "That belongs to the other mode",
			message:
				code === "ENVIRONMENT_LOCKED"
					? "It already holds orders, payments or a connected provider, so test and live cannot be swapped. Rehearsals and real books cannot share one ledger."
					: "This workspace is in one mode and what you asked for was set up in the other. Switch mode, or use the credentials that belong to this one.",
			requestId,
			kind: "environment",
		};
	}

	if (status === 409) {
		return {
			code: "409",
			title: "This changed before we could finish",
			message:
				"Refresh the latest information, review it, and then try your action again.",
			requestId,
			kind: "conflict",
		};
	}
	/**
	 * 🔴 413 was falling through to "Something went wrong on our side".
	 *
	 * It is not our side and nothing is wrong: the thing being sent is too big.
	 * A person uploading a product photo, a logo or a CSV was told the platform
	 * had broken, which sends them to support for a problem they could have
	 * fixed in ten seconds.
	 *
	 * ⚠️ No size in the copy. The ceiling differs per route — images, imports
	 * and attachments do not share one — and a number that is wrong on three
	 * screens out of four is worse than no number.
	 */
	if (status === 413) {
		return {
			code: "413",
			title: "That was too large to send",
			message:
				"The file or request exceeded the limit for this action, so nothing was uploaded. Try a smaller file, or split the import into parts.",
			requestId,
			// `invalid` because the page is fine and one request was refused. It
			// belongs inline with the toolbar intact, exactly like a 400.
			kind: "invalid",
		};
	}

	/**
	 * 🔴 503 and 504 were also becoming the generic 500, which TAKES THE PAGE.
	 *
	 * Both are temporary by definition — a dependency that has not answered
	 * yet, or a request that ran out of time — and the identical attempt often
	 * succeeds seconds later. Walling the console over something that heals
	 * itself is the same overreaction the offline screen used to make.
	 */
	if (status === 503 || status === 504) {
		return {
			code: String(status),
			title: status === 504 ? "That took too long" : "That service is busy",
			message:
				status === 504
					? "The request ran out of time before it finished. Nothing was changed, so it is safe to try again."
					: "Something QuickDash depends on is not answering right now. It usually clears in a moment.",
			requestId,
			kind: "timeout",
		};
	}

	if (status === 429) {
		return {
			code: "429",
			title: "Too many requests",
			// Says how long, because "a moment" is the word people use when they
			// do not know — and the reader's next question is always "how long".
			message:
				"QuickDash slowed this request down to protect the workspace. Give it a few seconds and retry.",
			requestId,
			kind: "rate-limit",
		};
	}
	/**
	 * 🔴 A TypeError is NOT automatically a network failure.
	 *
	 * `fetch` rejects with a TypeError when it cannot reach the server — but so
	 * does every ordinary programming mistake, and this branch used to catch all
	 * of them. A panel that read `data.items` on an array crashed, and the
	 * console told the operator to check their internet connection. They then
	 * check their connection, find it fine, and report the wrong bug.
	 *
	 * So a TypeError only counts as offline when it actually looks like a failed
	 * fetch. The messages differ per browser and none is standardised, hence
	 * matching several: Chrome "Failed to fetch", Firefox "NetworkError when
	 * attempting to fetch resource", Safari "Load failed".
	 */
	const looksLikeFetchFailure =
		candidate instanceof TypeError &&
		/failed to fetch|networkerror|load failed|fetch/i.test(
			candidate.message ?? "",
		);

	if (
		looksLikeFetchFailure ||
		candidate?.code === "NETWORK_ERROR" ||
		candidate?.code === "ERR_NETWORK"
	) {
		return {
			code: "OFFLINE",
			title: "QuickDash couldn't connect",
			message:
				"Check your connection and try again. Your workspace data has not been changed.",
			requestId,
			kind: "network",
		};
	}
	/**
	 * 🔴 Only promise a request id when there IS one.
	 *
	 * This branch catches two different things: a request that failed, which
	 * carries an id, and a CRASH in the console's own code, which cannot. Both
	 * were told to "include the request ID when asking for help" — so half the
	 * time the console asked for something it had just failed to give, and the
	 * reader went looking for an id that was never there.
	 */
	return {
		code: status && status >= 500 ? String(status) : "ERROR",
		title: "Something went wrong",
		message: requestId
			? "QuickDash couldn't load this page. Try again; if it keeps happening, quote the request ID below when asking for help."
			: "QuickDash couldn't load this page. Try again; if it keeps happening, tell us what you were doing and we will look into it.",
		requestId,
		kind: "server",
	};
}

function RequestId({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="mt-5">
			<p className="text-[12px] text-muted-foreground">Request ID</p>
			<div className="mt-1 flex items-center justify-center gap-2">
				<code className="max-w-full select-all break-all rounded border border-foreground/10 bg-foreground/5 px-2 py-1 text-[11px]">
					{value}
				</code>
				<button
					type="button"
					onClick={copy}
					className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-foreground/10 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Copy request ID"
				>
					<Copy className="size-3.5" />
				</button>
			</div>
			<span className="sr-only" aria-live="polite">
				{copied ? "Request ID copied." : ""}
			</span>
		</div>
	);
}

export function RequestErrorScreen({
	error,
	onRetry,
	homeHref,
	homeLabel = "Go back",
}: {
	error: unknown;
	onRetry?: () => void;
	homeHref?: string;
	homeLabel?: string;
}) {
	const presentation = presentRequestError(error);
	return (
		<StatusScreen
			code={presentation.code}
			title={presentation.title}
			message={presentation.message}
			action={
				<div className="grid gap-2">
					{onRetry ? (
						<button type="button" onClick={onRetry} className={primaryButton}>
							Try again
						</button>
					) : null}
					{homeHref ? (
						<a href={homeHref} className={subtleButton}>
							{homeLabel}
						</a>
					) : null}
					{presentation.requestId ? (
						<RequestId value={presentation.requestId} />
					) : null}
				</div>
			}
		/>
	);
}

export function InlineRequestError({
	error,
	onRetry,
	className,
}: {
	error: unknown;
	onRetry?: () => void;
	className?: string;
}) {
	const presentation = presentRequestError(error);
	return (
		<div
			role="alert"
			className={cn(
				"rounded-xl border border-destructive/20 bg-destructive/5 p-4",
				className,
			)}
		>
			<div className="flex items-start gap-3">
				<WarningCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm">{presentation.title}</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{presentation.message}
					</p>
					{presentation.requestId ? (
						<p className="mt-2 break-all text-muted-foreground text-xs">
							Request ID:{" "}
							<code className="select-all">{presentation.requestId}</code>
						</p>
					) : null}
					{onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							className="mt-3 font-medium text-sm underline underline-offset-4"
						>
							Try again
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function PageLoadingState({
	label = "Loading…",
	rows = 3,
	className,
}: {
	label?: string;
	rows?: number;
	className?: string;
}) {
	const rowIds = [
		"first",
		"second",
		"third",
		"fourth",
		"fifth",
		"sixth",
		"seventh",
		"eighth",
	].slice(0, Math.max(1, Math.min(rows, 8)));
	return (
		<main
			className={cn("space-y-4 p-6", className)}
			aria-busy="true"
			aria-label={label}
		>
			<div role="status" className="sr-only">
				{label}
			</div>
			<Skeleton className="h-7 w-48" />
			<Skeleton className="h-4 w-72 max-w-full" />
			<div className="grid gap-3 pt-2">
				{rowIds.map((rowId) => (
					<Skeleton key={rowId} className="h-16 w-full rounded-xl" />
				))}
			</div>
		</main>
	);
}

export function ActionableEmptyState({
	title,
	description,
	icon,
	action,
	className,
}: {
	title: string;
	description: string;
	icon?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<Empty className={className}>
			<EmptyHeader>
				{icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
