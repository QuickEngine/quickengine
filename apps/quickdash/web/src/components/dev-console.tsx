import {
	ArrowClockwiseIcon,
	FunnelSimpleIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { webhookQueries } from "../lib/webhooks-api";

/**
 * The developer console: what this workspace actually did.
 *
 * 🔑 It earns the bottom of the window because its content is CONTINUOUS. A log
 * is the one thing you watch out of the corner of your eye while working on
 * something else — which is exactly what a docked strip is for, and exactly
 * what a calculator is not.
 *
 * ⚠️ It stops at the sidebar deliberately. You watch a delivery fail, then
 * click through to the order it was about; covering the navigation would make
 * this modal in practice even though it is not.
 *
 * 🔴 Everything here already existed with nothing showing it. Deliveries have
 * been signed, retried and recorded since Step 8K; `api_mutations` has recorded
 * every write with its request id since durable writes landed. The only new
 * thing is `GET /v1/requests`, because single-lookup by id answers "what did
 * this one do" and cannot answer "what is my integration doing right now".
 */

type RecentRequest = {
	requestId: string | null;
	operation: string;
	state: string;
	source: string | null;
	actorType: string | null;
	responseStatus: number | null;
	durationMs: number | null;
	startedAt: string;
};

const TABS = [
	{ id: "requests", label: "Requests" },
	{ id: "deliveries", label: "Webhooks" },
] as const;

const time = new Intl.DateTimeFormat("en", {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

/** Colour by what it MEANS, not by how loud it is. */
function tone(status: number | null, state?: string): string {
	if (state === "pending") return "var(--ink-35)";
	if (status === null) return "var(--signal-attention)";
	if (status >= 500) return "var(--signal-failure)";
	if (status >= 400) return "var(--signal-attention)";
	return "var(--signal-success)";
}

export function DevConsole({ workspaceId }: { workspaceId: string }) {
	const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("requests");
	const [failuresOnly, setFailuresOnly] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);

	const requests = useQuery({
		queryKey: ["quickdash", workspaceId, "requests", failuresOnly],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: RecentRequest[] }>(
					`/requests?limit=100${failuresOnly ? "&failures=true" : ""}`,
				)
			).data,
		/**
		 * ⏱ Ten seconds, and only while the console is open — it unmounts when
		 * closed, which stops the timer. A log that never refreshes is a
		 * screenshot, and one that polls every second is a load test.
		 */
		refetchInterval: 10_000,
		enabled: tab === "requests",
	});

	const endpoints = useQuery({
		...webhookQueries.endpoints(workspaceId),
		enabled: tab === "deliveries",
	});
	const first = endpoints.data?.[0]?.id ?? null;
	const deliveries = useQuery({
		...webhookQueries.deliveries(workspaceId, first),
		refetchInterval: 10_000,
		enabled: tab === "deliveries" && Boolean(first),
	});

	const copy = (value: string) => {
		void navigator.clipboard?.writeText(value);
		setCopied(value);
		window.setTimeout(() => setCopied(null), 1500);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-1 border-[var(--console-line-soft)] border-b px-2">
				<TerminalWindowIcon
					size={14}
					className="mx-1 shrink-0 text-[var(--ink-35)]"
				/>
				{TABS.map((entry) => (
					<button
						key={entry.id}
						type="button"
						onClick={() => setTab(entry.id)}
						className={`h-7 rounded-md px-2.5 text-[11.5px] transition-colors ${
							tab === entry.id
								? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-90)]"
								: "text-[var(--ink-40)] hover:text-[var(--ink-75)]"
						}`}
					>
						{entry.label}
					</button>
				))}
				<div className="min-w-0 flex-1" />
				{tab === "requests" ? (
					<button
						type="button"
						onClick={() => setFailuresOnly((only) => !only)}
						title="Only what failed"
						className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11.5px] transition-colors ${
							failuresOnly
								? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-85)]"
								: "text-[var(--ink-40)] hover:text-[var(--ink-75)]"
						}`}
					>
						<FunnelSimpleIcon size={13} />
						Failures
					</button>
				) : null}
				<button
					type="button"
					aria-label="Refresh"
					title="Refresh"
					onClick={() => {
						void (tab === "requests"
							? requests.refetch()
							: deliveries.refetch());
					}}
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-40)] transition-colors hover:text-[var(--ink-85)]"
				>
					<ArrowClockwiseIcon size={13} />
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
				{tab === "requests" ? (
					requests.isPending ? (
						<p className="p-3 text-[var(--ink-30)]">Loading…</p>
					) : (requests.data?.items ?? []).length === 0 ? (
						<p className="p-3 text-[var(--ink-30)]">
							{failuresOnly
								? "Nothing has failed."
								: "Nothing yet. Every write this workspace makes appears here with its request id."}
						</p>
					) : (
						(requests.data?.items ?? []).map((row) => (
							<button
								/* ⚠️ Keyed on the id AND the start time. A request id covers a
								   whole request, and one request can write several times — so
								   the id alone is not unique in this list. */
								key={`${row.requestId ?? "none"}-${row.startedAt}-${row.operation}`}
								type="button"
								onClick={() => row.requestId && copy(row.requestId)}
								title={row.requestId ? "Copy request id" : undefined}
								className="flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-[rgb(var(--console-ink)/0.04)]"
							>
								<span className="w-[4.5rem] shrink-0 text-[var(--ink-25)] tabular-nums">
									{time.format(new Date(row.startedAt))}
								</span>
								<span
									className="w-8 shrink-0 tabular-nums"
									style={{ color: tone(row.responseStatus, row.state) }}
								>
									{row.responseStatus ?? "···"}
								</span>
								<span className="min-w-0 flex-1 truncate text-[var(--ink-75)]">
									{row.operation}
								</span>
								<span className="w-16 shrink-0 text-right text-[var(--ink-30)] tabular-nums">
									{row.durationMs === null ? "—" : `${row.durationMs}ms`}
								</span>
								<span className="w-[5.5rem] shrink-0 truncate text-right text-[var(--ink-25)]">
									{copied === row.requestId
										? "copied"
										: (row.requestId?.slice(0, 8) ?? "")}
								</span>
							</button>
						))
					)
				) : endpoints.isPending ? (
					<p className="p-3 text-[var(--ink-30)]">Loading…</p>
				) : !first ? (
					<p className="p-3 text-[var(--ink-30)]">
						No endpoint registered. Add one in Settings under Webhooks and every
						event lands here, signed and retried.
					</p>
				) : (deliveries.data ?? []).length === 0 ? (
					<p className="p-3 text-[var(--ink-30)]">
						No deliveries yet for this endpoint.
					</p>
				) : (
					(deliveries.data ?? []).map((row) => (
						<div
							key={row.id}
							className="flex items-center gap-3 px-3 py-1.5 hover:bg-[rgb(var(--console-ink)/0.04)]"
						>
							<span className="w-[4.5rem] shrink-0 text-[var(--ink-25)] tabular-nums">
								{time.format(new Date(row.createdAt))}
							</span>
							<span
								className="w-8 shrink-0 tabular-nums"
								style={{ color: tone(row.responseStatus) }}
							>
								{row.responseStatus ?? "···"}
							</span>
							<span className="min-w-0 flex-1 truncate text-[var(--ink-75)]">
								{row.eventName}
							</span>
							{/* 🔑 Attempts, because a delivery that succeeded on the fourth
							    try is not the same as one that succeeded. */}
							<span className="w-16 shrink-0 text-right text-[var(--ink-30)] tabular-nums">
								{row.attempts > 1 ? `${row.attempts} tries` : ""}
							</span>
							<span className="w-[5.5rem] shrink-0 truncate text-right text-[var(--ink-25)]">
								{row.status}
							</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
