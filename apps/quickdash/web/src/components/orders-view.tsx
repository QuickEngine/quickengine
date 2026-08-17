import { FunnelIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { EmptyState, PageState } from "./page-state";

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
	unitAmountCents: number;
};

type OrderRow = {
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
	destination?: Record<string, unknown> | null;
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

const chip =
	"rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)] capitalize";

/**
 * The address a parcel goes to, printed as a person would write it.
 *
 * Read defensively: the destination is a snapshot taken at checkout, so its
 * shape belongs to whatever the storefront sent that day, not to today's code.
 */
function addressLines(destination: Record<string, unknown> | null | undefined) {
	if (!destination) return [];
	const value = (key: string) =>
		typeof destination[key] === "string" ? (destination[key] as string) : null;
	return [
		value("name"),
		value("line1") ?? value("address1"),
		value("line2") ?? value("address2"),
		[value("city"), value("region") ?? value("state"), value("postalCode")]
			.filter(Boolean)
			.join(" "),
		value("country"),
	].filter((line): line is string => Boolean(line?.trim()));
}

function OrderPanel({
	workspaceId,
	orderId,
	onClose,
}: {
	workspaceId: string;
	orderId: string;
	onClose: () => void;
}) {
	const detail = useQuery({
		queryKey: ["quickdash", workspaceId, "order", orderId],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<OrderDetail>(
					`/orders/${orderId}`,
				)
			).data,
	});

	return (
		<aside className="fixed inset-y-0 right-0 z-30 flex w-[28rem] max-w-full flex-col border-[var(--console-line-strong)] border-l bg-[var(--console-panel)]">
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
								<span className={chip}>{order.status}</span>
								<span className="text-[11px] text-[var(--ink-30)]">
									{when(order.createdAt)}
								</span>
								<span className="ml-auto text-[12.5px] text-[var(--ink-85)]">
									{money(order.totalCents, order.currency)}
								</span>
							</div>

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
													line.unitAmountCents * line.quantity,
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

							{addressLines(order.destination).length > 0 ? (
								<>
									<p className="mt-4 mb-1 text-[11px] text-[var(--ink-45)]">
										Deliver to
									</p>
									<div className="text-[11.5px] text-[var(--ink-60)] leading-5">
										{addressLines(order.destination).map((line) => (
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
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const orders = useQuery({
		queryKey: ["quickdash", workspaceId, "orders"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: OrderRow[] }>(
					"/orders?limit=100",
				)
			).data,
	});

	const filtered = (orders.data?.items ?? [])
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

	const waiting = (orders.data?.items ?? []).filter((order) =>
		NEEDS_ACTION.has(order.status),
	).length;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
					<MagnifyingGlassIcon
						size={14}
						className="shrink-0 text-[var(--ink-30)]"
					/>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search by order number, name or email"
						className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
					/>
				</div>

				<Popover>
					<PopoverAnchor asChild>
						<div className="flex shrink-0 items-center gap-2">
							<PopoverTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 text-[12.5px] text-[var(--ink-50)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)]">
								<FunnelIcon size={14} />
								Filter
								{statuses.length > 0 ? (
									<span className={chip}>{statuses.length}</span>
								) : null}
							</PopoverTrigger>
						</div>
					</PopoverAnchor>
					<PopoverContent
						align="end"
						sideOffset={8}
						className="w-64 rounded-2xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-3"
					>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => {
								const on = statuses.includes(status);
								return (
									<button
										key={status}
										type="button"
										onClick={() =>
											setStatuses(
												on
													? statuses.filter((value) => value !== status)
													: [...statuses, status],
											)
										}
										className={`h-7 rounded-full border px-3 text-[11px] capitalize transition-colors ${
											on
												? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
												: "border-[var(--console-line-strong)] text-[var(--ink-60)] hover:text-[var(--ink-90)]"
										}`}
									>
										{status}
									</button>
								);
							})}
						</div>
					</PopoverContent>
				</Popover>
			</div>

			{waiting > 0 ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
					{waiting} {waiting === 1 ? "order needs" : "orders need"} attention.
				</p>
			) : null}

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
				{() =>
					filtered.length === 0 ? (
						<EmptyState
							title="Nothing matches"
							detail="Try a different search, or clear the status filter."
						/>
					) : (
						<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
							{filtered.map((order) => (
								<button
									type="button"
									key={order.id}
									onClick={() => setSelectedId(order.id)}
									className="flex w-full items-center gap-3 py-2.5 text-left transition-opacity hover:opacity-80"
								>
									<span className="w-24 shrink-0 font-mono text-[11.5px] text-[var(--ink-60)]">
										{order.number}
									</span>
									<span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
										{order.clientName}
									</span>
									<span className={chip}>{order.status}</span>
									<span className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
										{when(order.createdAt)}
									</span>
									<span className="w-24 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
										{money(order.totalCents, order.currency)}
									</span>
								</button>
							))}
						</div>
					)
				}
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
