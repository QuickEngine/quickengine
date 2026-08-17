import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

/**
 * Invoices — money asked for but not yet in hand.
 *
 * 🔑 Overdue is the only thing on this page worth interrupting somebody about,
 * so it leads. Everything else is a list; an unpaid invoice past its date is a
 * conversation the business needs to have today.
 *
 * ⚠️ `paid` and `void` are terminal. The status control offers only what the
 * backend will accept, rather than showing every value and letting the server
 * refuse — a menu that offers an illegal move is a menu that lies.
 */

const STATUSES = ["draft", "sent", "paid", "void"] as const;

/** What the backend permits from here. Mirrors the module's transition table. */
const NEXT_STATUSES: Record<string, string[]> = {
	draft: ["sent", "paid", "void"],
	sent: ["paid", "void"],
	paid: [],
	void: [],
};

type Invoice = {
	id: string;
	number: string;
	status: string;
	clientName: string | null;
	currency: string;
	totalCents: number;
	dueAt: string | null;
	createdAt: string;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "USD",
	}).format(cents / 100);

const isOverdue = (invoice: Invoice) =>
	Boolean(
		invoice.dueAt &&
			new Date(invoice.dueAt).getTime() < Date.now() &&
			invoice.status !== "paid" &&
			invoice.status !== "void",
	);

export function InvoicesView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const invoices = useQuery({
		queryKey: ["quickdash", workspaceId, "invoices"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Invoice[] }>(
					"/invoices?limit=100",
				)
			).data,
	});

	const setStatus = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await workspaceApi(workspaceId).request(`/invoices/${input.id}/status`, {
				method: "POST",
				body: { status: input.status },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "invoices"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search invoices by number or customer"
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
				query={invoices}
				loadingLabel="Loading invoices…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No invoices yet"
						detail="An invoice asks a customer to pay. Shops that take payment at checkout usually never need one."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((invoice) =>
							statuses.length === 0 ? true : statuses.includes(invoice.status),
						)
						.filter(
							(invoice) =>
								!needle ||
								invoice.number.toLowerCase().includes(needle) ||
								(invoice.clientName ?? "").toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					const overdue = rows.filter(isOverdue).length;

					return (
						<>
							{overdue > 0 ? (
								<p className="mb-3 text-[11.5px] text-[#f5b44a]">
									{overdue} {overdue === 1 ? "invoice is" : "invoices are"} past
									due.
								</p>
							) : null}
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{rows.map((invoice) => {
									const late = isOverdue(invoice);
									const moves = NEXT_STATUSES[invoice.status] ?? [];
									return (
										<div
											key={invoice.id}
											className="flex items-center gap-3 py-2.5"
										>
											<span className="w-24 shrink-0 font-mono text-[11.5px] text-[var(--ink-60)]">
												{invoice.number}
											</span>
											<span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
												{invoice.clientName ?? "No customer"}
											</span>
											<span className="w-20 shrink-0 text-[11px] text-[var(--ink-30)] capitalize">
												{invoice.status}
											</span>
											{invoice.dueAt ? (
												<span
													className={`w-32 shrink-0 text-right text-[11px] ${
														late ? "text-[#f5b44a]" : "text-[var(--ink-30)]"
													}`}
												>
													{late ? "Overdue " : "Due "}
													{new Date(invoice.dueAt).toLocaleDateString()}
												</span>
											) : (
												<span className="w-32 shrink-0" />
											)}
											<span className="w-24 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
												{money(invoice.totalCents, invoice.currency)}
											</span>
											<div className="flex shrink-0 items-center gap-1.5">
												{moves.map((status) => (
													<button
														key={status}
														type="button"
														className={quiet}
														disabled={rowBusy(setStatus, invoice.id)}
														onClick={() =>
															setStatus.mutate({ id: invoice.id, status })
														}
													>
														{status === "sent"
															? "Mark sent"
															: status === "paid"
																? "Mark paid"
																: "Void"}
													</button>
												))}
											</div>
										</div>
									);
								})}
							</div>
						</>
					);
				}}
			</PageState>
		</main>
	);
}
