import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

type AuditEntry = {
	id: string;
	action: string;
	actorType: string;
	actorId: string;
	actorName: string | null;
	actorEmail: string | null;
	resourceType: string;
	resourceId: string;
	requestId: string;
	source: string;
	occurredAt: string;
	metadata: Record<string, string | number | boolean | null>;
};

/**
 * Activity — who did what to this business's records.
 *
 * ── Why this page exists ─────────────────────────────────────────────────────
 *
 * 🔴 Every financial change has been writing an audit row since the beginning
 * and nothing could read one. The answer to "who refunded this order, and when"
 * was in the database and reachable only by somebody with psql and the schema in
 * their head. A trail nobody can read is not evidence.
 *
 * 🔑 It is written for 2am with a customer on the phone. That means: the person
 * named rather than their id, the record named rather than a uuid dropped on the
 * floor, and a way to pull up everything that happened in the same action —
 * because one click writes several rows and reading them apart tells you
 * nothing.
 */

/**
 * `<module>.<thing>.<verb>` turned into something a person reads.
 *
 * ⚠️ A map, not a formatter. Splitting on dots and title-casing produces
 * "Payment Refund Created", which is not how anybody describes what happened —
 * and every unmapped action still shows its raw name, which is honest and makes
 * the gap visible rather than papering over it.
 */
const ACTION_LABELS: Record<string, string> = {
	"order.created": "placed an order",
	"order.updated": "changed an order",
	"order.status.changed": "moved an order along",
	"order.deleted": "deleted a draft order",
	"payment.recorded": "took a payment",
	"payment.refunded": "refunded a payment",
	"payment.status.changed": "changed a payment's status",
	"inventory.adjusted": "adjusted stock",
	"catalog.item.created": "added a product",
	"catalog.item.updated": "changed a product",
	"catalog.item.deleted": "removed a product",
	"discount.created": "created a discount",
	"shipment.created": "created a shipment",
	"subscription.started": "started a subscription",
	"subscription.cancelled": "cancelled a subscription",
};

/** Where a change came from, said plainly. */
const SOURCE_LABELS: Record<string, string> = {
	dashboard: "in QuickDash",
	api: "through the API",
	webhook: "from a payment provider",
	system: "automatically",
	job: "on a schedule",
};

/**
 * 🔑 An actor is a PERSON, a key, or nobody. All three are meaningful and the
 * third is the one that matters most — a change nobody watched happen is
 * exactly what an audit log is for.
 */
function actorLabel(entry: AuditEntry): string {
	if (entry.actorName) return entry.actorName;
	if (entry.actorEmail) return entry.actorEmail;
	if (entry.actorType === "api_key") return "An API key";
	if (entry.actorType === "system") return "QuickDash";
	return "Someone";
}

const when = (iso: string) => {
	const at = new Date(iso);
	const seconds = Math.round((Date.now() - at.getTime()) / 1000);
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function AuditView({ workspaceId }: { workspaceId: string }) {
	const [search, setSearch] = useState("");
	/**
	 * ⚠️ Narrowing to one request is a MODE, not a search term. A request id is
	 * not something anybody types — it is arrived at by clicking one, and the
	 * page then answers a different question: what else happened in that action.
	 */
	const [requestId, setRequestId] = useState<string | null>(null);

	const audit = useQuery({
		queryKey: ["quickdash", workspaceId, "audit", requestId],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: AuditEntry[] }>(
					`/quickdash/audit?limit=100${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ""}`,
				)
			).data,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by person, action or record"
			/>

			{requestId ? (
				<div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--console-line)] px-3.5 py-2.5">
					<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-50)] leading-5">
						Showing everything that happened in one action.{" "}
						<span className="font-mono text-[10.5px] text-[var(--ink-35)]">
							{requestId}
						</span>
					</p>
					<button
						type="button"
						onClick={() => setRequestId(null)}
						className="shrink-0 rounded-full border border-[var(--console-line-strong)] px-2.5 py-1 text-[11px] text-[var(--ink-60)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]"
					>
						Show everything
					</button>
				</div>
			) : null}

			<PageState
				query={audit}
				loadingLabel="Loading activity…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing has happened yet"
						detail="Every change to an order, a payment, your stock or your catalog is recorded here with who made it and when. Nothing is written by hand, and nothing can be edited."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter((row) =>
						!needle
							? true
							: [
									actorLabel(row),
									ACTION_LABELS[row.action] ?? row.action,
									row.resourceType,
									row.resourceId,
									row.actorEmail ?? "",
								]
									.join(" ")
									.toLowerCase()
									.includes(needle),
					);
					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						);
					}
					return (
						<ol className="flex flex-col">
							{rows.map((row) => (
								<li
									key={row.id}
									className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-[var(--console-line-soft)] border-b py-3 last:border-b-0"
								>
									<span className="text-[12.5px] text-[var(--ink-85)]">
										{actorLabel(row)}
									</span>
									<span className="text-[12.5px] text-[var(--ink-55)]">
										{ACTION_LABELS[row.action] ?? row.action}
									</span>
									{/* The record itself. Monospaced because it is an
									    identifier somebody may need to copy, not prose. */}
									<span className="font-mono text-[11px] text-[var(--ink-35)]">
										{row.resourceType}/{row.resourceId.slice(0, 8)}
									</span>
									<span className="text-[11.5px] text-[var(--ink-30)]">
										{SOURCE_LABELS[row.source] ?? row.source}
									</span>
									<span className="min-w-0 flex-1" />
									{/* 🔑 The reason the request id is on screen at all: one
									    customer action writes several rows, and this is what
									    puts them together. */}
									<button
										type="button"
										onClick={() => setRequestId(row.requestId)}
										title="Show everything that happened in this action"
										className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10.5px] text-[var(--ink-25)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-70)]"
									>
										{row.requestId.slice(0, 8)}
									</button>
									<span
										className="shrink-0 text-[11px] text-[var(--ink-30)]"
										title={new Date(row.occurredAt).toLocaleString()}
									>
										{when(row.occurredAt)}
									</span>
								</li>
							))}
						</ol>
					);
				}}
			</PageState>
		</main>
	);
}
