import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { RequestIdInline } from "./outlet-error";
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
 * `thing.verb` turned into something a person reads.
 *
 * 🔴 The first version of this was a hand-written map of guesses — it had
 * `catalog.item.created` when the real action is `catalog-item.created`, and
 * `inventory.adjusted` for `inventory-item.adjusted`. Almost nothing matched, so
 * almost every row rendered its raw slug. It was written by imagining the
 * vocabulary instead of reading it, and it took querying the actual table to
 * notice.
 *
 * 🔑 Derived rather than enumerated. There are ninety-five actions and the shape
 * is completely regular, so a map would be ninety-five chances to make the same
 * mistake again and would silently miss the ninety-sixth the day it ships.
 *
 * Two small vocabularies do the work: what a business CALLS the thing (nobody
 * says "catalog item"), and what the verb means in plain English. Anything
 * unrecognised still reads as words rather than as a slug.
 */
const NOUNS: Record<string, string> = {
	"catalog-item": "product",
	"product-variant": "variant",
	"inventory-item": "stock item",
	"purchase-order": "purchase order",
	"time-entry": "time entry",
	"file-document": "file",
	"file-folder": "folder",
	"file-version": "file version",
	"file-attachment": "attachment",
	apikey: "API key",
	client: "customer",
};

const VERBS: Record<string, string> = {
	created: "added",
	updated: "changed",
	deleted: "deleted",
	adjusted: "adjusted",
	"status-changed": "changed the status of",
	sent: "sent",
	accepted: "accepted",
	declined: "declined",
	converted: "converted",
	revised: "revised",
	archived: "archived",
	restored: "restored",
	issued: "issued",
	revoked: "revoked",
	joined: "joined",
	removed: "removed",
	released: "released",
	invoiced: "invoiced",
	detached: "detached",
	replayed: "replayed",
	"tracking-updated": "added tracking to",
	"deletion-requested": "asked to delete",
	"fulfillment-ensured": "started fulfilling",
};

/**
 * ⚠️ The ones where deriving gives the wrong meaning, not merely a clumsy one.
 *
 * `order.paid` is the important one: it is written by the payment provider's
 * webhook, so "Stripe paid an order" inverts who did what. The customer paid;
 * the provider told us.
 */
const PHRASES: Record<string, string> = {
	"order.paid": "confirmed payment for order",
	"payment.recorded": "took payment",
	"payment.refunded": "refunded payment",
	"payment.status-changed": "changed the status of payment",
	"client.address.created": "added an address for customer",
	"client.address.updated": "changed an address for customer",
	"client.address.deleted": "removed an address for customer",
	// ⚠️ Needs the noun in the MIDDLE, which the derivation cannot express — it
	// produced "marked as shipped purchase order".
	"purchase-order.shipped": "marked a purchase order shipped",
	"workspace.deleted": "deleted the workspace",
};

function describe(action: string): string {
	const phrase = PHRASES[action];
	if (phrase) return phrase;
	const split = action.lastIndexOf(".");
	if (split < 1) return action;
	const thing = action.slice(0, split);
	const verb = action.slice(split + 1);
	const noun = NOUNS[thing] ?? thing.replace(/-/g, " ");
	return `${VERBS[verb] ?? verb.replace(/-/g, " ")} ${noun}`;
}

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
	// ⚠️ `order.paid` and `payment.status-changed` are both written by the
	// provider's webhook, and they were reading as "Someone" — which is the one
	// word that suggests a person nobody can identify, on the two entries where
	// we know exactly what wrote them.
	if (entry.actorType === "payment_provider") return "The payment provider";
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
	const statusFilter = useChipFilter();
	const [search, setSearch] = useState("");
	/**
	 * ⚠️ Narrowing to one request is a MODE, not a search term. A request id is
	 * not something anybody types — it is arrived at by clicking one, and the
	 * page then answers a different question: what else happened in that action.
	 */
	const [requestId, setRequestId] = useState<string | null>(null);
	const { layout, setLayout } = useListLayout(workspaceId);

	const audit = useQuery({
		queryKey: ["quickdash", workspaceId, "audit", requestId],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: AuditEntry[] }>(
					`/quickdash/audit?limit=100${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ""}`,
				)
			).data,
	});

	/**
	 * 🔑 DERIVED, not enumerated. There are ninety-five actions and the list
	 * grows with every feature; hardcoding them here would go stale the first
	 * time one is added. The first segment of `catalog-item.created` is the
	 * thing it happened to, which is what somebody actually filters by.
	 */
	const areas = [
		...new Set(
			(audit.data?.items ?? []).map((row) => row.action.split(".")[0]),
		),
	].sort();

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				onClearFilter={() => statusFilter.clear()}
				filter={statusFilter.chips("Area", areas)}
				filterCount={statusFilter.count}
				exportRows={() => audit.data?.items ?? []}
				exportName="activity"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by person, action or record"
			/>

			{requestId ? (
				<div
					/* The same material as the list under it. This notice sits on the
					   page while a mode is on, so it has to be an object on the page
					   rather than a rule drawn on the floor. */
					style={{ boxShadow: "var(--lift-card)" }}
					className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--console-line)] bg-[var(--surface-tile)] px-3.5 py-2.5"
				>
					<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-50)] leading-5">
						Showing everything that happened in one action.
					</p>
					{/* Mandatory on any id shown to a person: it exists to be pasted
					    into a support thread, and retyping a uuid by eye is how the
					    wrong one gets pasted. */}
					<RequestIdInline id={requestId} />
					<button
						type="button"
						onClick={() => setRequestId(null)}
						className="control-raised flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11px] text-[var(--ink-60)] outline-none hover:text-[var(--ink-90)]"
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
						!statusFilter.keep(row.action.split(".")[0])
							? false
							: !needle
								? true
								: [
										actorLabel(row),
										describe(row.action),
										row.resourceType,
										row.resourceId,
										row.actorEmail ?? "",
									]
										.join(" ")
										.toLowerCase()
										.includes(needle),
					);
					return (
						<PagedTable
							workspaceId={workspaceId}
							layout={layout}
							caption="Activity"
							rows={rows}
							exportName="activity"
							empty={
								<EmptyState
									title="Nothing matches"
									detail="Try a different search, or clear the area filter."
								/>
							}
							/* 🔴 The sentence LIVES ON, as the card.
							   This page was the last one drawing its own rows straight
							   onto the outlet: no frame, no lift, no columns, no sort and
							   no paging, because a hand written `<ol>` has none of those.
							   Moving it onto the shared table is what gives it all of
							   them, and it costs the one genuinely good thing the page
							   had, which is that a row reads as a sentence. So the
							   sentence becomes the card view. Table when you are looking
							   for a pattern down a column, cards when you are reading
							   what happened. */
							renderCard={(row) => (
								<>
									<p className="text-[12.5px] text-[var(--ink-85)] leading-snug">
										{actorLabel(row)}{" "}
										<span className="text-[var(--ink-55)]">
											{describe(row.action)}
										</span>{" "}
										<span className="font-mono text-[11px] text-[var(--ink-35)]">
											{row.resourceId.slice(0, 8)}
										</span>
									</p>
									<div className="mt-1.5 flex items-center gap-1.5">
										<span className="text-[11px] text-[var(--ink-30)]">
											{SOURCE_LABELS[row.source] ?? row.source}
										</span>
										<span
											className="ml-auto text-[11px] text-[var(--ink-30)]"
											title={new Date(row.occurredAt).toLocaleString()}
										>
											{when(row.occurredAt)}
										</span>
									</div>
								</>
							)}
							/* ⚠️ The keys are REAL fields on the row, not display names.
							   The shared table sorts by reading `row[key]`, so a column
							   keyed "who" would sort by undefined and quietly do nothing
							   while the header claimed otherwise. */
							columns={[
								{
									key: "actorName",
									header: "Who",
									render: (row) => (
										<span className="text-[var(--ink-85)]">
											{actorLabel(row)}
										</span>
									),
								},
								{
									key: "action",
									header: "What",
									render: (row) => describe(row.action),
								},
								{
									key: "resourceId",
									header: "Record",
									render: (row) => (
										<span className="font-mono text-[11px] text-[var(--ink-45)]">
											{row.resourceId.slice(0, 8)}
										</span>
									),
								},
								{
									key: "source",
									header: "Where",
									render: (row) => SOURCE_LABELS[row.source] ?? row.source,
								},
								{
									key: "requestId",
									header: "Action",
									/* 🔑 The reason the request id is on screen at all: one
									   customer action writes several rows, and this is what
									   puts them together. */
									render: (row) => (
										<button
											type="button"
											onClick={() => setRequestId(row.requestId)}
											title="Show everything that happened in this action"
											className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--ink-30)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-70)]"
										>
											{row.requestId.slice(0, 8)}
										</button>
									),
								},
								{
									key: "occurredAt",
									header: "When",
									render: (row) => (
										<span title={new Date(row.occurredAt).toLocaleString()}>
											{when(row.occurredAt)}
										</span>
									),
								},
							]}
						/>
					);
				}}
			</PageState>
		</main>
	);
}
