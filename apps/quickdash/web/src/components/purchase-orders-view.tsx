import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { money } from "../lib/catalog";
import { useListLayout } from "../lib/list-view";
import { ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";

type PurchaseOrderLine = {
	supplierSku: string;
	description: string;
	quantity: number;
	unitCostCents: number | null;
	currency: string;
};

type PurchaseOrder = {
	id: string;
	number: string;
	status: string;
	supplierId: string;
	supplierName: string;
	handoffMethod: string;
	orderId: string | null;
	orderNumber: string | null;
	carrier: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	failureReason: string | null;
	supplierReference: string | null;
	sentAt: string | null;
	createdAt: string;
	lines: PurchaseOrderLine[];
};

/**
 * What each status means to somebody who did not write the code.
 *
 * 🔴 `sent` is deliberately not "Sent". A supplier having RECEIVED the ask is
 * the fact an operator needs; "sent" reads like an email left someone's outbox
 * and says nothing about whether anybody is acting on it.
 */
const STATUS_LABELS: Record<string, string> = {
	draft: "Waiting to be sent",
	sending: "Sending",
	sent: "With the supplier",
	acknowledged: "Supplier accepted",
	shipped: "Shipped",
	received: "Received",
	cancelled: "Cancelled",
	failed: "Could not be sent",
};

/** Only two states are worth colouring. Everything else is ordinary progress. */
const STATUS_TONE: Record<string, string> = {
	failed: "var(--signal-failure)",
	shipped: "var(--signal-news)",
};

/**
 * What a business has asked its suppliers for.
 *
 * ⚠️ READ ONLY, on purpose. A purchase order is raised automatically when an
 * order is PAID, never by hand — inventing one here would ask a supplier for
 * goods nobody bought and charge the business for them. The screen exists to
 * answer "did the supplier get it, and where is it", which is the question a
 * customer is asking when they email.
 */
export function PurchaseOrdersView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const [search, setSearch] = useState("");

	const purchaseOrders = useQuery({
		queryKey: ["quickdash", workspaceId, "purchase-orders"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: PurchaseOrder[] }>(
					"/inventory/purchase-orders",
				)
			).data,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by supplier, order or tracking"
			/>

			<PageState
				query={purchaseOrders}
				loadingLabel="Loading purchase orders…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing has been ordered from a supplier yet"
						detail="When a customer pays for something one of your suppliers makes, the ask is raised here automatically and sent the way that supplier is reached. Nothing is ordered by hand."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter((row) =>
						!needle
							? true
							: [
									row.number,
									row.supplierName,
									row.orderNumber ?? "",
									row.trackingNumber ?? "",
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
						<PagedTable
							workspaceId={workspaceId}
							layout={layout}
							caption="Purchase orders"
							rows={rows}
							columns={[
								{
									key: "number",
									header: "Reference",
									render: (row) => row.number,
								},
								{
									key: "supplier",
									header: "Supplier",
									render: (row) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{row.supplierName}
										</span>
									),
								},
								{
									key: "contents",
									header: "Asked for",
									render: (row) =>
										row.lines.length === 0 ? (
											<span className="text-[11px] text-[var(--ink-45)]">
												—
											</span>
										) : (
											<span className="text-[11px] text-[var(--ink-30)]">
												{row.lines
													.map(
														(line) => `${line.quantity} × ${line.description}`,
													)
													.join(", ")}
											</span>
										),
								},
								{
									key: "cost",
									header: "Cost",
									width: "w-24",
									tight: true,
									align: "right",
									render: (row) => {
										/**
										 * ⚠️ What the BUSINESS pays, never what the customer paid.
										 * A supplier's price list and a retail price are separate
										 * numbers and showing them in one column invites the wrong
										 * one into a margin calculation.
										 */
										const priced = row.lines.filter(
											(line) => line.unitCostCents !== null,
										);
										if (priced.length === 0) {
											return (
												<span className="text-[11px] text-[var(--ink-45)]">
													—
												</span>
											);
										}
										const total = priced.reduce(
											(sum, line) =>
												sum + (line.unitCostCents ?? 0) * line.quantity,
											0,
										);
										return (
											<span className="text-[11px] text-[var(--ink-30)]">
												{money(total, priced[0].currency)}
											</span>
										);
									},
								},
								{
									key: "order",
									header: "For order",
									width: "w-32",
									tight: true,
									render: (row) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{row.orderNumber ?? "—"}
										</span>
									),
								},
								{
									key: "status",
									header: "Status",
									width: "w-44",
									tight: true,
									render: (row) => (
										<span className="flex flex-col gap-0.5">
											<span
												className="text-[11px]"
												style={{
													color: STATUS_TONE[row.status] ?? "var(--ink-30)",
												}}
											>
												{STATUS_LABELS[row.status] ?? row.status}
											</span>
											{/**
											 * 🔴 Surfaced in the list, not hidden behind a click.
											 * A purchase order that could not be sent is a customer
											 * waiting for coffee nobody ordered, and it has to be
											 * visible without anybody going looking for it.
											 */}
											{row.failureReason ? (
												<span className="text-[10.5px] text-[var(--signal-failure)]">
													{row.failureReason}
												</span>
											) : null}
										</span>
									),
								},
								{
									key: "tracking",
									header: "Tracking",
									width: "w-44",
									tight: true,
									render: (row) => {
										if (!row.trackingNumber) {
											return (
												<span className="text-[11px] text-[var(--ink-45)]">
													—
												</span>
											);
										}
										const label = row.carrier
											? `${row.carrier} · ${row.trackingNumber}`
											: row.trackingNumber;
										return row.trackingUrl ? (
											<a
												className="text-[11px] text-[var(--ink-30)] underline underline-offset-2"
												href={row.trackingUrl}
												target="_blank"
												rel="noreferrer noopener"
											>
												{label}
											</a>
										) : (
											<span className="text-[11px] text-[var(--ink-30)]">
												{label}
											</span>
										);
									},
								},
								{
									key: "raised",
									header: "Raised",
									width: "w-28",
									tight: true,
									align: "right",
									render: (row) => (
										<span className="text-[11px] text-[var(--ink-45)]">
											{new Date(row.createdAt).toLocaleDateString()}
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
