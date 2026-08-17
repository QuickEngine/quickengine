import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { QuotePanel } from "./module-panels";
import { EmptyState, PageState, rowBusy } from "./page-state";

/**
 * Quotes — a price offered, before anybody has agreed to it.
 *
 * 🔑 The whole point is the answer. A quote sitting in `sent` is waiting on a
 * customer; one `accepted` is waiting on US to turn it into work. Sorting or
 * grouping by anything else buries the only question the page exists to answer.
 *
 * ⚠️ Accepting and declining are recorded on the operator's behalf here. The
 * customer's own accept/decline arrives through the portal — same endpoints,
 * different actor — so a quote can change under this page while it is open.
 */

const STATUSES = [
	"draft",
	"sent",
	"accepted",
	"declined",
	"expired",
	"voided",
	"superseded",
	"converted",
] as const;

type Quote = {
	id: string;
	number: string;
	status: string;
	clientName: string | null;
	currency: string;
	totalCents: number;
	expiresAt: string | null;
	createdAt: string;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "USD",
	}).format(cents / 100);

/** Expiring is worth flagging: a quote that lapses is a sale quietly lost. */
const isLapsed = (quote: Quote) =>
	Boolean(
		quote.expiresAt &&
			new Date(quote.expiresAt).getTime() < Date.now() &&
			(quote.status === "sent" || quote.status === "draft"),
	);

export function QuotesView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals();
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const quotes = useQuery({
		queryKey: ["quickdash", workspaceId, "quotes"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Quote[] }>(
					"/quotes?limit=100",
				)
			).data,
	});

	const act = useMutation({
		mutationFn: async (input: {
			id: string;
			action: "send" | "accept" | "decline";
		}) => {
			await workspaceApi(workspaceId).request(
				`/quotes/${input.id}/${input.action}`,
				{ method: "POST", idempotencyKey: crypto.randomUUID() },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "quotes"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search quotes by number or customer"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => (
								<FilterChip
									key={status}
									label={status}
									active={statuses.includes(status)}
									onToggle={() =>
										setStatuses(
											statuses.includes(status)
												? statuses.filter((value) => value !== status)
												: [...statuses, status],
										)
									}
								/>
							))}
						</div>
					</>
				}
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={quotes}
				loadingLabel="Loading quotes…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No quotes yet"
						detail="A quote offers a price before the work starts. Accepted ones can become an invoice or a job."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((quote) =>
							statuses.length === 0 ? true : statuses.includes(quote.status),
						)
						.filter(
							(quote) =>
								!needle ||
								quote.number.toLowerCase().includes(needle) ||
								(quote.clientName ?? "").toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					const awaiting = rows.filter(
						(quote) => quote.status === "accepted",
					).length;

					return (
						<>
							{awaiting > 0 ? (
								<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
									{awaiting} accepted {awaiting === 1 ? "quote" : "quotes"}{" "}
									waiting to become work.
								</p>
							) : null}
							<PagedTable
								rowSignal={rowSignal}
								workspaceId={workspaceId}
								layout={layout}
								caption="Quotes"
								rows={rows}
								selectedId={selectedId}
								onOpen={(quote) => setSelectedId(quote.id)}
								columns={[
									{
										key: "number",
										header: "Quote",
										width: "w-24",
										tight: true,
										render: (quote) => (
											<span className="font-mono text-[11.5px] text-[var(--ink-60)]">
												{quote.number}
											</span>
										),
									},
									{
										key: "customer",
										header: "Customer",
										render: (quote) => quote.clientName ?? "No customer",
									},
									{
										key: "status",
										header: "Status",
										width: "w-24",
										tight: true,
										render: (quote) => (
											<span
												className={`text-[11px] capitalize ${
													isLapsed(quote)
														? "text-[var(--signal-attention)]"
														: "text-[var(--ink-30)]"
												}`}
											>
												{isLapsed(quote) ? "expired" : quote.status}
											</span>
										),
									},
									{
										key: "total",
										header: "Total",
										width: "w-24",
										align: "right",
										tight: true,
										render: (quote) => money(quote.totalCents, quote.currency),
									},
									{
										key: "actions",
										header: "",
										align: "right",
										tight: true,
										render: (quote) => (
											<div className="flex items-center justify-end gap-1.5">
												{quote.status === "draft" ? (
													<button
														type="button"
														className={quiet}
														disabled={rowBusy(act, quote.id)}
														onClick={() =>
															act.mutate({ id: quote.id, action: "send" })
														}
													>
														Send
													</button>
												) : null}
												{quote.status === "sent" ? (
													<>
														<button
															type="button"
															className={quiet}
															disabled={rowBusy(act, quote.id)}
															onClick={() =>
																act.mutate({ id: quote.id, action: "accept" })
															}
														>
															Accepted
														</button>
														<button
															type="button"
															className={quiet}
															disabled={rowBusy(act, quote.id)}
															onClick={() =>
																act.mutate({ id: quote.id, action: "decline" })
															}
														>
															Declined
														</button>
													</>
												) : null}
											</div>
										),
									},
								]}
							/>
						</>
					);
				}}
			</PageState>
			{selectedId ? (
				<QuotePanel
					workspaceId={workspaceId}
					id={selectedId}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
