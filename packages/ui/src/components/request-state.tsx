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
			message:
				"Your account does not have permission to view or change this workspace resource.",
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
	if (status === 429) {
		return {
			code: "429",
			title: "Too many requests",
			message:
				"QuickDash paused this request to protect the workspace. Wait a moment, then try again.",
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
	return {
		code: status && status >= 500 ? String(status) : "ERROR",
		title: "Something went wrong",
		message:
			"QuickDash couldn't load this page. Try again; if it keeps happening, include the request ID when asking for help.",
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
