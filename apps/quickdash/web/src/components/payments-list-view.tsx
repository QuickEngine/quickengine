import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { parseAmountCents } from "../lib/money-input";
import { useRecordSignals } from "../lib/record-signals";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { PaymentPanel } from "./module-panels";
import { EmptyState, PageState, WriteFailure } from "./page-state";

/**
 * Payments — money that actually moved.
 *
 * 🔴 A refund here sends REAL money back to a real person and cannot be undone.
 * So it is a deliberate two-step, never a single click on a row: the amount is
 * confirmed first, and the default is the full amount rather than a blank box
 * somebody could fat-finger.
 *
 * 🔑 Shows what was refunded alongside what was paid. A payment of $100 with
 * $40 returned is neither "paid" nor "refunded", and a status word alone cannot
 * express that.
 */

const STATUSES = [
	"pending",
	"processing",
	"succeeded",
	"failed",
	"disputed",
	"refunded",
] as const;

type Refund = { id: string; amountCents: number; status?: string };

type Payment = {
	id: string;
	invoiceId: string | null;
	amountCents: number;
	currency: string;
	status: string;
	provider: string;
	reference: string | null;
	createdAt: string;
	refunds?: Refund[];
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const solid =
	"inline-flex h-7 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink))] px-2.5 text-[11px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const field =
	"h-7 w-24 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-2.5 text-[11.5px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)]";

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "USD",
	}).format(cents / 100);

const refundedCents = (payment: Payment) =>
	(payment.refunds ?? []).reduce(
		(total, refund) => total + refund.amountCents,
		0,
	);

export function PaymentsListView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [refunding, setRefunding] = useState<string | null>(null);
	const [amount, setAmount] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const payments = useQuery({
		queryKey: ["quickdash", workspaceId, "payments"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Payment[] }>(
					"/payments?limit=100",
				)
			).data,
	});

	const refund = useMutation({
		mutationFn: async (input: { id: string; amountCents: number }) => {
			await workspaceApi(workspaceId).request(`/payments/${input.id}/refund`, {
				method: "POST",
				body: { amountCents: input.amountCents },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That refund did not go through."),
		onSuccess: () => {
			setRefunding(null);
			setAmount("");
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "payments"],
			});
		},
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search payments by reference or provider"
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

			{failure ? <WriteFailure message={failure} /> : null}

			<PageState
				query={payments}
				loadingLabel="Loading payments…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No payments yet"
						detail="Every payment your shop takes appears here, with what was refunded against it."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((payment) =>
							statuses.length === 0 ? true : statuses.includes(payment.status),
						)
						.filter(
							(payment) =>
								!needle ||
								(payment.reference ?? "").toLowerCase().includes(needle) ||
								payment.provider.toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					return (
						<PagedTable
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Payments"
							rows={rows}
							selectedId={selectedId}
							onOpen={(payment) => setSelectedId(payment.id)}
							columns={[
								{
									key: "amount",
									header: "Amount",
									render: (payment) => (
										<>
											{money(payment.amountCents, payment.currency)}
											<span className="ml-2 text-[11px] text-[var(--ink-30)] capitalize">
												{payment.provider}
											</span>
										</>
									),
								},
								{
									key: "refunded",
									header: "Refunded",
									width: "w-40",
									render: (payment) => {
										const returned = refundedCents(payment);
										return returned > 0 ? (
											<span className="text-[11px] text-[var(--ink-45)]">
												{money(returned, payment.currency)} back ·{" "}
												{money(
													payment.amountCents - returned,
													payment.currency,
												)}{" "}
												kept
											</span>
										) : null;
									},
								},
								{
									key: "status",
									header: "Status",
									width: "w-24",
									tight: true,
									render: (payment) => (
										<span className="text-[12px] text-[var(--ink-60)] capitalize">
											{payment.status}
										</span>
									),
								},
								{
									key: "taken",
									header: "Taken",
									width: "w-24",
									align: "right",
									tight: true,
									render: (payment) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(payment.createdAt).toLocaleDateString()}
										</span>
									),
								},
								{
									key: "refund",
									header: "",
									align: "right",
									tight: true,
									/**
									 * 🔴 The refund form lives IN the row, on one line, rather
									 * than expanding a second line beneath it. A row that grows
									 * when opened shifts every row under it, which is how
									 * somebody clicks refund on the wrong payment.
									 */
									render: (payment) => {
										const returned = refundedCents(payment);
										const remaining = payment.amountCents - returned;
										const canRefund =
											payment.status === "succeeded" && remaining > 0;
										if (!canRefund) return null;
										const open = refunding === payment.id;
										// 🔴 A refund is the field somebody is MOST likely to
										// type a currency symbol into, because they are copying
										// a figure off the payment above it. `Number("$12.00")`
										// is NaN, which silently refused the refund.
										const entered = parseAmountCents(amount) ?? 0;
										const validAmount =
											Number.isFinite(entered) &&
											entered > 0 &&
											entered <= remaining;
										return (
											<div className="flex items-center justify-end gap-1.5">
												{open ? (
													<>
														<input
															value={amount}
															onChange={(event) =>
																setAmount(event.target.value)
															}
															inputMode="decimal"
															className={field}
														/>
														<button
															type="button"
															className={`${solid} ${refund.isPending ? "shimmer-busy" : ""}`}
															disabled={!validAmount || refund.isPending}
															onClick={() =>
																refund.mutate({
																	id: payment.id,
																	amountCents: entered,
																})
															}
														>
															{refund.isPending ? "Refunding…" : "Send back"}
														</button>
													</>
												) : null}
												<button
													type="button"
													className={quiet}
													onClick={() => {
														setRefunding(open ? null : payment.id);
														// Defaults to everything still refundable, because
														// a full refund is the common case and an empty box
														// invites a typo against real money.
														setAmount((remaining / 100).toFixed(2));
														setFailure(null);
													}}
												>
													{open ? "Cancel" : "Refund"}
												</button>
											</div>
										);
									},
								},
							]}
						/>
					);
				}}
			</PageState>
			{selectedId ? (
				<PaymentPanel
					workspaceId={workspaceId}
					id={selectedId}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
