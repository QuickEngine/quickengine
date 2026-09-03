import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useAcknowledgeRecord, useRecordSignals } from "../lib/record-signals";
import { useSelectedRecord } from "../lib/selected-record";
import { detailCard } from "./detail-panel";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
import {
	ShipmentComposer,
	type ShippableOrder,
	shipBlockedReason,
} from "./shipment-composer";

/**
 * Orders — what a business has sold.
 *
 * 🔑 Ordered the way an operator works: what needs doing is at the top, and the
 * money is the thing they check first. A list sorted by id, or one that leads
 * with internal state, is a report rather than a workspace.
 */

const STATUSES = [
	"draft",
	"placed",
	"confirmed",
	"processing",
	"fulfilled",
	"cancelled",
] as const;

/**
 * Which statuses still want a human.
 *
 * 🔴 `draft` is deliberately NOT here. A draft order is one whose payment never
 * completed — checkout creates it before the provider confirms — so treating it
 * as work to do would have somebody chasing abandoned carts as if they were
 * sales.
 */
const NEEDS_ACTION = new Set(["placed", "confirmed", "processing"]);

type OrderLine = {
	id: string;
	name: string;
	quantity: number;
	/**
	 * 🔴 `unitPriceCents`, which is what the API actually sends.
	 *
	 * This was declared as `unitAmountCents` — a field the API has never
	 * returned. TypeScript was satisfied because the type asserted it existed,
	 * so `undefined * quantity` reached the screen as "CA$NaN" on every line of
	 * every order, from the day it was written until 2026-08-22.
	 *
	 * ⚠️ A hand-written type over a network response is an assertion, not a
	 * check. It is only as true as the person who typed it.
	 */
	unitPriceCents: number;
};

type OrderRow = {
	/**
	 * What has been returned, and what was taken, in cents.
	 *
	 * 🔴 On the LIST row, not only the detail. An order's `status` is its
	 * fulfilment lifecycle, so a fully refunded order still reads "placed" — and
	 * in a list of work to do that means somebody picks and packs a parcel for a
	 * customer who already has their money back.
	 */
	refundedCents?: number;
	paidCents?: number;
	id: string;
	number: string;
	status: string;
	clientName: string;
	clientEmail: string | null;
	currency: string;
	totalCents: number;
	createdAt: string;
};

type OrderDetail = OrderRow & {
	subtotalCents: number;
	notes: string | null;
	lineItems: OrderLine[];
	payment: {
		id: string;
		amountCents: number;
		currency: string;
		provider: string;
		status: string;
		reference: string | null;
		refunds?: Array<{ id: string; amountCents: number; status: string }>;
	} | null;
	shipments: Array<{
		id: string;
		status: string;
		carrier: string | null;
		trackingNumber: string | null;
		trackingUrl: string | null;
	}>;
	/**
	 * ⚠️ FLAT, not nested. The detail route spreads the order DTO into its
	 * response and the DTO stores the delivery address column by column. A
	 * `destination` object was declared here once and never populated.
	 */
	shipToName?: string | null;
	shipToLine1?: string | null;
	shipToLine2?: string | null;
	shipToCity?: string | null;
	shipToRegion?: string | null;
	shipToPostalCode?: string | null;
	shipToCountryCode?: string | null;
};

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "USD",
	}).format(cents / 100);

const when = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

/**
 * How much of this order's money has gone back.
 *
 * 🔴 An order's `status` is its FULFILMENT lifecycle — placed, processing,
 * fulfilled. Whether it was paid for lives on the payment, and whether that
 * money was returned lives on the refunds. All three are separate facts and all
 * three are correct.
 *
 * ⚠️ But an operator scanning a list does not think that way. A fully refunded
 * order that still reads "placed" looks like work waiting to be done, and the
 * one thing that mattered — the customer got their money back — is two clicks
 * away. So the chip says what actually happened to the money once it has moved.
 *
 * Partial refunds deliberately do NOT take over the chip: half a refund is not
 * a finished order, and calling it "refunded" would hide that the rest is still
 * owed.
 */
function refundState(order: {
	refundedCents?: number;
	paidCents?: number;
	payment?: {
		amountCents: number;
		refunds?: Array<{ amountCents: number }>;
	} | null;
}): "none" | "partial" | "full" {
	/**
	 * ⚠️ Two shapes, one answer.
	 *
	 * The LIST gets scalar totals from a correlated subquery; the DETAIL has the
	 * payment and its refunds in full. Both must reach the same conclusion, so
	 * the rule lives here once rather than being written twice and drifting.
	 */
	const returned =
		order.refundedCents ??
		(order.payment?.refunds ?? []).reduce(
			(total, refund) => total + refund.amountCents,
			0,
		);
	const taken = order.paidCents ?? order.payment?.amountCents ?? 0;
	if (returned <= 0 || taken <= 0) return "none";
	return returned >= taken ? "full" : "partial";
}

const chip =
	"rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)] capitalize";

/**
 * The address a parcel goes to, printed as a person would write it.
 *
 * Read defensively: the destination is a snapshot taken at checkout, so its
 * shape belongs to whatever the storefront sent that day, not to today's code.
 */
/**
 * The delivery address, from the order's own columns.
 *
 * 🔴 This read a nested `destination` object looking for `line1`/`address1` and
 * friends. The order detail route spreads the order DTO into its response and
 * that DTO carries the address as FLAT `shipTo*` fields, so `destination` was
 * always undefined and the "Deliver to" block never rendered on any order — on
 * the one screen whose whole job is telling somebody where to send the parcel.
 */
function addressLines(order: {
	shipToName?: string | null;
	shipToLine1?: string | null;
	shipToLine2?: string | null;
	shipToCity?: string | null;
	shipToRegion?: string | null;
	shipToPostalCode?: string | null;
	shipToCountryCode?: string | null;
}) {
	return [
		order.shipToName,
		order.shipToLine1,
		order.shipToLine2,
		[order.shipToCity, order.shipToRegion, order.shipToPostalCode]
			.filter(Boolean)
			.join(" "),
		order.shipToCountryCode,
	].filter((line): line is string => Boolean(line?.trim()));
}

/**
 * Where an order may go next, mirroring the server's own table.
 *
 * 🔴 A paid order arrives as `placed`, and shipping refuses anything that is not
 * `confirmed` or `processing` — so without these actions "create shipment" is a
 * button that can only ever fail. Confirming is the operator saying "yes, I am
 * going to send this", which is a real decision and deliberately not automatic.
 *
 * ⚠️ Kept in step with `ALLOWED_TRANSITIONS` in `mod-orders/status.ts`. Offering
 * a move the server refuses is worse than offering none.
 */
const ORDER_MOVES: Record<string, readonly string[]> = {
	draft: ["placed", "cancelled"],
	placed: ["confirmed", "cancelled"],
	confirmed: ["processing", "cancelled"],
	processing: ["fulfilled", "cancelled"],
	fulfilled: [],
	cancelled: [],
};

const MOVE_LABEL: Record<string, string> = {
	placed: "Mark placed",
	confirmed: "Confirm",
	processing: "Start processing",
	fulfilled: "Mark fulfilled",
	cancelled: "Cancel order",
};

function OrderPanel({
	workspaceId,
	orderId,
	onClose,
}: {
	workspaceId: string;
	orderId: string;
	onClose: () => void;
}) {
	const [shipping, setShipping] = useState(false);
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const queryClient = useQueryClient();
	const detail = useQuery({
		queryKey: ["quickdash", workspaceId, "order", orderId],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<OrderDetail>(
					`/orders/${orderId}`,
				)
			).data,
	});

	const move = useMutation({
		mutationFn: async (status: string) => {
			await workspaceApi(workspaceId).request(`/orders/${orderId}/status`, {
				method: "POST",
				body: { status },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That order could not be changed.",
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "order", orderId],
			}),
	});

	return (
		<aside className={detailCard}>
			<header className="flex items-center gap-3 border-[var(--console-line-soft)] border-b px-4 py-3">
				<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
					{detail.data ? `Order ${detail.data.number}` : "Order"}
				</p>
				<button
					type="button"
					onClick={onClose}
					className="h-7 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
				>
					Close
				</button>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				<PageState
					query={detail}
					loadingLabel="Loading order…"
					skeleton="panel"
				>
					{(order) => (
						<>
							<div className="flex items-center gap-2">
								<span className={chip}>
									{refundState(order) === "full" ? "refunded" : order.status}
								</span>
								<span className="text-[11px] text-[var(--ink-30)]">
									{when(order.createdAt)}
								</span>
								<span className="ml-auto text-[12.5px] text-[var(--ink-85)]">
									{money(order.totalCents, order.currency)}
								</span>
							</div>

							{/* The operator's decisions about this order, offered only where
							    the server would accept them. A paid order arrives `placed`
							    and must be confirmed before it can be shipped. */}
							{(ORDER_MOVES[order.status] ?? []).length > 0 ? (
								<div className="mt-2.5 flex flex-wrap gap-1.5">
									{(ORDER_MOVES[order.status] ?? []).map((next) => (
										<button
											key={next}
											type="button"
											disabled={move.isPending}
											onClick={() => move.mutate(next)}
											className="h-7 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40"
										>
											{move.isPending && move.variables === next
												? "Saving…"
												: (MOVE_LABEL[next] ?? next)}
										</button>
									))}
								</div>
							) : null}
							{failure ? (
								<WriteFailure
									error={failure.error}
									message={failure.fallback}
								/>
							) : null}

							<p className="mt-3 text-[11px] text-[var(--ink-45)]">Customer</p>
							<p className="text-[12px] text-[var(--ink-85)]">
								{order.clientName}
							</p>
							{order.clientEmail ? (
								<p className="text-[11.5px] text-[var(--ink-30)]">
									{order.clientEmail}
								</p>
							) : null}

							<p className="mt-4 mb-1 text-[11px] text-[var(--ink-45)]">
								Items
							</p>
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-y">
								{order.lineItems.length === 0 ? (
									<p className="py-2 text-[11.5px] text-[var(--ink-30)]">
										No items recorded on this order.
									</p>
								) : (
									order.lineItems.map((line) => (
										<div
											key={line.id}
											className="flex items-baseline gap-2 py-2"
										>
											<span className="text-[11px] text-[var(--ink-30)]">
												{line.quantity}×
											</span>
											<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-85)]">
												{line.name}
											</span>
											<span className="text-[12px] text-[var(--ink-60)]">
												{money(
													line.unitPriceCents * line.quantity,
													order.currency,
												)}
											</span>
										</div>
									))
								)}
							</div>

							{/* 🔴 Payment and refunds together. A total with no payment state
							    is how somebody ships an order that was never actually paid. */}
							<p className="mt-4 mb-1 text-[11px] text-[var(--ink-45)]">
								Payment
							</p>
							{order.payment ? (
								<div className="text-[11.5px] text-[var(--ink-60)]">
									<p>
										<span className="capitalize">{order.payment.provider}</span>{" "}
										· <span className="capitalize">{order.payment.status}</span>{" "}
										· {money(order.payment.amountCents, order.payment.currency)}
									</p>
									{(order.payment.refunds ?? []).map((refund) => (
										<p key={refund.id} className="text-[var(--ink-45)]">
											Refunded {money(refund.amountCents, order.currency)} (
											{refund.status})
										</p>
									))}
								</div>
							) : (
								<p className="text-[11.5px] text-[var(--ink-30)]">
									No payment recorded yet.
								</p>
							)}

							{addressLines(order).length > 0 ? (
								<>
									<p className="mt-4 mb-1 text-[11px] text-[var(--ink-45)]">
										Deliver to
									</p>
									<div className="text-[11.5px] text-[var(--ink-60)] leading-5">
										{addressLines(order).map((line) => (
											<p key={line}>{line}</p>
										))}
									</div>
								</>
							) : null}

							<p className="mt-4 mb-1 text-[11px] text-[var(--ink-45)]">
								Shipping
							</p>
							{order.shipments.length === 0 ? (
								<p className="text-[11.5px] text-[var(--ink-30)]">
									Nothing shipped yet.
								</p>
							) : (
								order.shipments.map((shipment) => (
									<p
										key={shipment.id}
										className="text-[11.5px] text-[var(--ink-60)]"
									>
										<span className="capitalize">{shipment.status}</span>
										{shipment.carrier ? ` · ${shipment.carrier}` : ""}
										{shipment.trackingNumber
											? ` · ${shipment.trackingNumber}`
											: ""}
									</p>
								))
							)}

							{/* 🔑 Fulfilment starts HERE, on the order somebody paid for,
							    rather than on the shipments list where the first question
							    would be "which order?" — which is already answered. */}
							{shipBlockedReason(order as ShippableOrder) === null ? (
								<button
									type="button"
									onClick={() => setShipping(true)}
									className="mt-2.5 h-7 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
								>
									{order.shipments.length === 0
										? "Create shipment"
										: "Ship the rest"}
								</button>
							) : (
								<p className="mt-2.5 text-[10.5px] text-[var(--ink-30)]">
									{shipBlockedReason(order as ShippableOrder)}
								</p>
							)}

							{shipping ? (
								<ShipmentComposer
									workspaceId={workspaceId}
									order={order as ShippableOrder}
									onClose={() => setShipping(false)}
								/>
							) : null}

							{order.notes ? (
								<>
									<p className="mt-4 mb-1 text-[11px] text-[var(--ink-45)]">
										Notes
									</p>
									<p className="text-[11.5px] text-[var(--ink-60)] leading-5">
										{order.notes}
									</p>
								</>
							) : null}
						</>
					)}
				</PageState>
			</div>
		</aside>
	);
}

export function OrdersView({ workspaceId }: { workspaceId: string }) {
	const [query, setQuery] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [selectedId, setSelectedId] = useSelectedRecord();
	// Opening a record accounts for whatever it was flagged for.
	useAcknowledgeRecord(workspaceId, selectedId);

	const { layout, setLayout } = useListLayout(workspaceId);
	// The dots come from the bell, so marking a notification read clears
	// the row it pointed at.
	const rowSignal = useRecordSignals(workspaceId);
	const orders = useQuery({
		queryKey: ["quickdash", workspaceId, "orders"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: OrderRow[] }>(
					"/orders?limit=100",
				)
			).data,
	});

	const filteredOrders: OrderRow[] = (orders.data?.items ?? [])
		.filter((order) =>
			statuses.length === 0 ? true : statuses.includes(order.status),
		)
		.filter((order) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			return (
				order.number.toLowerCase().includes(needle) ||
				order.clientName.toLowerCase().includes(needle) ||
				(order.clientEmail ?? "").toLowerCase().includes(needle)
			);
		});

	const _waiting = (orders.data?.items ?? []).filter((order) =>
		NEEDS_ACTION.has(order.status),
	).length;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				exportRows={() => filteredOrders}
				exportName="orders"
				query={query}
				onQueryChange={setQuery}
				placeholder="Search by order number, name or email"
				filterCount={statuses.length}
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
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

			<PageState
				query={orders}
				loadingLabel="Loading orders…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No orders yet"
						detail="Orders appear here the moment a customer completes checkout on your site. Nothing to do until then."
					/>
				}
			>
				{() => (
					<PagedTable
						empty={
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						}
						workspaceId={workspaceId}
						layout={layout}
						caption="Orders"
						rowSignal={rowSignal}
						rows={filteredOrders}
						selectedId={selectedId}
						onOpen={(order) => setSelectedId(order.id)}
						columns={[
							{
								key: "number",
								header: "Order",
								width: "w-28",
								tight: true,
								render: (order) => (
									<span className="font-mono text-[11.5px] text-[var(--ink-60)]">
										{order.number}
									</span>
								),
							},
							{
								key: "customer",
								header: "Customer",
								render: (order) => order.clientName,
							},
							{
								key: "status",
								header: "Status",
								width: "w-28",
								tight: true,
								render: (order) => (
									<span className={chip}>
										{refundState(order) === "full" ? "refunded" : order.status}
									</span>
								),
							},
							{
								key: "placed",
								header: "Placed",
								width: "w-28",
								align: "right",
								tight: true,
								render: (order) => (
									<span className="text-[11px] text-[var(--ink-30)]">
										{when(order.createdAt)}
									</span>
								),
							},
							{
								key: "total",
								header: "Total",
								width: "w-28",
								align: "right",
								tight: true,
								render: (order) => money(order.totalCents, order.currency),
							},
						]}
					/>
				)}
			</PageState>

			{selectedId ? (
				<OrderPanel
					workspaceId={workspaceId}
					orderId={selectedId}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
