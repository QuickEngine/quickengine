import { money } from "../lib/catalog";
import { Block, BlockEmpty, Fact } from "./detail-panel";
import { type RecordAction, RecordPanel } from "./record-panel";
import { TrackingForm } from "./tracking-form";

/**
 * The detail panel for each remaining module record.
 *
 * 🔑 Gathered in one file because they are variations on a theme, not nine
 * unrelated screens: each names a record, states the few facts that matter,
 * lists whatever hangs off it, and offers the moves the API will accept. Kept
 * apart they drifted; kept together the differences are visible at a glance.
 *
 * ⚠️ Actions are declared, not hand-wired. `RecordPanel` owns the request, the
 * idempotency key, the failure line and invalidating the list — the three
 * things most likely to be forgotten.
 */

const date = (value: string | null | undefined) =>
	value ? new Date(value).toLocaleDateString() : "-";

const dateTime = (value: string | null | undefined) =>
	value ? new Date(value).toLocaleString() : "-";

const titleCase = (value: string) => value.replace(/[_-]/g, " ");

/** Line items priced per unit, shared by invoices and quotes. */
function Lines({
	lines,
	currency,
}: {
	lines: Array<{
		id: string;
		description?: string | null;
		name?: string | null;
		quantity: number;
		unitPriceCents: number;
	}>;
	currency: string;
}) {
	if (lines.length === 0) return <BlockEmpty>No lines.</BlockEmpty>;
	return (
		<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
			{lines.map((line) => (
				<div key={line.id} className="flex items-center gap-3 py-2">
					<span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
						{line.name ?? line.description ?? "Untitled"}
					</span>
					<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
						{line.quantity} × {money(line.unitPriceCents, currency)}
					</span>
					<span className="w-20 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
						{money(line.quantity * line.unitPriceCents, currency)}
					</span>
				</div>
			))}
		</div>
	);
}

type PanelProps = { workspaceId: string; id: string; onClose: () => void };

/* ── Invoices ─────────────────────────────────────────────────────────────── */

type InvoiceDetail = {
	id: string;
	number: string;
	status: string;
	clientName: string | null;
	currency: string;
	subtotalCents?: number;
	taxCents?: number;
	totalCents: number;
	dueAt: string | null;
	notes?: string | null;
	lineItems?: Array<{
		id: string;
		description: string | null;
		quantity: number;
		unitPriceCents: number;
	}>;
};

/** What the backend accepts from each status. A menu must not offer an illegal move. */
const INVOICE_MOVES: Record<string, string[]> = {
	draft: ["sent", "paid", "void"],
	sent: ["paid", "void"],
	paid: [],
	void: [],
};

export function InvoicePanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<InvoiceDetail>
			workspaceId={workspaceId}
			resource="invoices"
			id={id}
			onClose={onClose}
			title={(invoice) => invoice.number}
			subtitle={(invoice) =>
				`${titleCase(invoice.status)} · ${money(invoice.totalCents, invoice.currency)}`
			}
			actions={(invoice) =>
				(INVOICE_MOVES[invoice.status] ?? []).map(
					(status): RecordAction => ({
						label:
							status === "sent"
								? "Mark sent"
								: status === "paid"
									? "Mark paid"
									: "Void",
						path: "status",
						body: { status },
					}),
				)
			}
		>
			{(invoice) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Customer">{invoice.clientName ?? "No customer"}</Fact>
						<Fact label="Due">{date(invoice.dueAt)}</Fact>
					</div>
					<Block title="Lines">
						<Lines
							lines={invoice.lineItems ?? []}
							currency={invoice.currency}
						/>
					</Block>
					<Block title="Total">
						<Fact label="Amount">
							{money(invoice.totalCents, invoice.currency)}
						</Fact>
					</Block>
					{invoice.notes ? (
						<Block title="Notes">
							<p className="text-[12.5px] text-[var(--ink-85)] leading-5">
								{invoice.notes}
							</p>
						</Block>
					) : null}
				</>
			)}
		</RecordPanel>
	);
}

/* ── Quotes ───────────────────────────────────────────────────────────────── */

type QuoteDetail = {
	id: string;
	number: string;
	status: string;
	clientName: string | null;
	currency: string;
	totalCents: number;
	expiresAt: string | null;
	lineItems?: Array<{
		id: string;
		name: string | null;
		description: string | null;
		quantity: number;
		unitPriceCents: number;
	}>;
};

export function QuotePanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<QuoteDetail>
			workspaceId={workspaceId}
			resource="quotes"
			id={id}
			onClose={onClose}
			title={(quote) => quote.number}
			subtitle={(quote) =>
				`${titleCase(quote.status)} · ${money(quote.totalCents, quote.currency)}`
			}
			actions={(quote) => [
				{ label: "Send", path: "send", when: quote.status === "draft" },
				{
					label: "Accepted",
					path: "accept",
					when: quote.status === "sent",
				},
				{
					label: "Declined",
					path: "decline",
					when: quote.status === "sent",
				},
				{
					label: "Void",
					path: "void",
					when: quote.status !== "accepted" && quote.status !== "void",
				},
			]}
		>
			{(quote) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Customer">{quote.clientName ?? "No customer"}</Fact>
						<Fact label="Expires">{date(quote.expiresAt)}</Fact>
					</div>
					<Block title="Lines">
						<Lines lines={quote.lineItems ?? []} currency={quote.currency} />
					</Block>
					<Block title="Total">
						<Fact label="Amount">
							{money(quote.totalCents, quote.currency)}
						</Fact>
					</Block>
				</>
			)}
		</RecordPanel>
	);
}

/* ── Payments ─────────────────────────────────────────────────────────────── */

type PaymentDetail = {
	id: string;
	amountCents: number;
	currency: string;
	status: string;
	provider: string;
	paymentMethod?: string | null;
	reference: string | null;
	succeededAt?: string | null;
	refundedAt?: string | null;
	refunds?: Array<{
		id: string;
		amountCents: number;
		reason?: string | null;
		createdAt: string;
	}>;
};

export function PaymentPanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<PaymentDetail>
			workspaceId={workspaceId}
			resource="payments"
			id={id}
			onClose={onClose}
			title={(payment) => money(payment.amountCents, payment.currency)}
			subtitle={(payment) =>
				`${titleCase(payment.status)} · ${payment.provider}`
			}
			// 🔴 No refund button here. A refund needs an AMOUNT, and a one-click
			// full refund sitting beside the status is exactly how somebody returns
			// more money than they meant to. It belongs behind its own form.
			actions={() => []}
		>
			{(payment) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Provider">{payment.provider}</Fact>
						<Fact label="Method">{payment.paymentMethod ?? "-"}</Fact>
						<Fact label="Reference">{payment.reference ?? "-"}</Fact>
						<Fact label="Succeeded">{dateTime(payment.succeededAt)}</Fact>
					</div>
					<Block title="Refunds" aside={payment.refunds?.length || undefined}>
						{(payment.refunds ?? []).length === 0 ? (
							<BlockEmpty>Nothing refunded.</BlockEmpty>
						) : (
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{(payment.refunds ?? []).map((refund) => (
									<div key={refund.id} className="flex items-center gap-3 py-2">
										<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-60)]">
											{refund.reason ?? "No reason given"}
										</span>
										<span className="shrink-0 text-[10.5px] text-[var(--ink-30)]">
											{date(refund.createdAt)}
										</span>
										<span className="w-20 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
											{money(refund.amountCents, payment.currency)}
										</span>
									</div>
								))}
							</div>
						)}
					</Block>
				</>
			)}
		</RecordPanel>
	);
}

/* ── Shipments ────────────────────────────────────────────────────────────── */

type ShipmentDetail = {
	id: string;
	status: string;
	carrier: string | null;
	serviceLevel: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shipToName?: string | null;
	shipToCity?: string | null;
	createdAt: string;
	shippedAt: string | null;
	deliveredAt?: string | null;
	parcels?: Array<{ id: string; weightGrams: number | null }>;
};

const SHIPMENT_MOVES: Record<string, string[]> = {
	draft: ["ready", "cancelled"],
	ready: ["shipped", "cancelled"],
	shipped: ["in_transit", "delivered", "exception"],
	in_transit: ["delivered", "exception"],
	exception: ["in_transit", "delivered"],
	delivered: [],
	cancelled: [],
};

export function ShipmentPanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<ShipmentDetail>
			workspaceId={workspaceId}
			resource="shipments"
			id={id}
			onClose={onClose}
			title={(shipment) => shipment.trackingNumber ?? "Shipment"}
			subtitle={(shipment) =>
				`${titleCase(shipment.status)}${shipment.carrier ? ` · ${shipment.carrier}` : ""}`
			}
			actions={(shipment) =>
				(SHIPMENT_MOVES[shipment.status] ?? []).map(
					(status): RecordAction => ({
						label: titleCase(status),
						path: "status",
						body: { status },
					}),
				)
			}
		>
			{(shipment) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Carrier">{shipment.carrier ?? "-"}</Fact>
						<Fact label="Service">{shipment.serviceLevel ?? "-"}</Fact>
						<Fact label="Tracking">
							{shipment.trackingUrl && shipment.trackingNumber ? (
								<a
									href={shipment.trackingUrl}
									target="_blank"
									rel="noreferrer"
									className="underline decoration-[var(--console-line-strong)] underline-offset-2"
								>
									{shipment.trackingNumber}
								</a>
							) : (
								(shipment.trackingNumber ?? "-")
							)}
						</Fact>
						<Fact label="Destination">
							{shipment.shipToName ?? shipment.shipToCity ?? "-"}
						</Fact>
					</div>
					{/* A number rarely exists while the box is being packed; it turns up
					    when the label is bought or a dropship supplier replies. */}
					<div className="mt-3">
						<TrackingForm
							workspaceId={workspaceId}
							shipmentId={shipment.id}
							carrier={shipment.carrier ?? null}
							serviceLevel={shipment.serviceLevel ?? null}
							trackingNumber={shipment.trackingNumber ?? null}
							trackingUrl={shipment.trackingUrl ?? null}
						/>
					</div>
					<Block title="Progress">
						<div className="space-y-1.5">
							<Fact label="Created">{dateTime(shipment.createdAt)}</Fact>
							<Fact label="Shipped">{dateTime(shipment.shippedAt)}</Fact>
							<Fact label="Delivered">{dateTime(shipment.deliveredAt)}</Fact>
						</div>
					</Block>
					<Block title="Parcels" aside={shipment.parcels?.length || undefined}>
						{(shipment.parcels ?? []).length === 0 ? (
							<BlockEmpty>No parcels recorded.</BlockEmpty>
						) : (
							<div className="space-y-1">
								{(shipment.parcels ?? []).map((parcel, index) => (
									<p
										key={parcel.id}
										className="text-[12.5px] text-[var(--ink-85)]"
									>
										Parcel {index + 1}
										{parcel.weightGrams ? ` · ${parcel.weightGrams}g` : ""}
									</p>
								))}
							</div>
						)}
					</Block>
				</>
			)}
		</RecordPanel>
	);
}

/* ── Bookings ─────────────────────────────────────────────────────────────── */

type BookingDetail = {
	id: string;
	title: string;
	status: string;
	clientName: string | null;
	startsAt: string;
	endsAt: string;
	timeZone: string;
	locationKind: string;
	location: string | null;
	notes?: string | null;
};

const BOOKING_MOVES: Record<string, string[]> = {
	pending: ["confirmed", "cancelled"],
	confirmed: ["completed", "cancelled", "no_show"],
	completed: [],
	cancelled: [],
	no_show: [],
};

export function BookingPanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<BookingDetail>
			workspaceId={workspaceId}
			resource="bookings"
			id={id}
			onClose={onClose}
			title={(booking) => booking.title}
			subtitle={(booking) =>
				`${titleCase(booking.status)} · ${dateTime(booking.startsAt)}`
			}
			actions={(booking) => [
				...(BOOKING_MOVES[booking.status] ?? []).map(
					(status): RecordAction => ({
						label: titleCase(status),
						path: "status",
						body: { status },
					}),
				),
				{
					label: "Invoice this",
					path: "invoice",
					when: booking.status === "completed",
				},
			]}
		>
			{(booking) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Customer">{booking.clientName ?? "No customer"}</Fact>
						<Fact label="Time zone">{booking.timeZone}</Fact>
						<Fact label="Starts">{dateTime(booking.startsAt)}</Fact>
						<Fact label="Ends">{dateTime(booking.endsAt)}</Fact>
					</div>
					<Block title="Where">
						<Fact label={titleCase(booking.locationKind)}>
							{booking.location ?? "Not specified"}
						</Fact>
					</Block>
					{booking.notes ? (
						<Block title="Notes">
							<p className="text-[12.5px] text-[var(--ink-85)] leading-5">
								{booking.notes}
							</p>
						</Block>
					) : null}
				</>
			)}
		</RecordPanel>
	);
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

type ProjectDetail = {
	id: string;
	name: string;
	status: string;
	description: string | null;
	startDate: string | null;
	dueDate: string | null;
	archivedAt: string | null;
};

export function ProjectPanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<ProjectDetail>
			workspaceId={workspaceId}
			resource="projects"
			id={id}
			onClose={onClose}
			title={(project) => project.name}
			subtitle={(project) =>
				project.archivedAt ? "Archived" : titleCase(project.status)
			}
			actions={(project) => [
				{ label: "Archive", path: "archive", when: !project.archivedAt },
				{
					label: "Restore",
					path: "restore",
					when: Boolean(project.archivedAt),
				},
			]}
		>
			{(project) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Starts">{date(project.startDate)}</Fact>
						<Fact label="Due">{date(project.dueDate)}</Fact>
					</div>
					{project.description ? (
						<Block title="Description">
							<p className="text-[12.5px] text-[var(--ink-85)] leading-5">
								{project.description}
							</p>
						</Block>
					) : null}
				</>
			)}
		</RecordPanel>
	);
}

/* ── Contracts ────────────────────────────────────────────────────────────── */

type ContractDetail = {
	id: string;
	number: string;
	title: string;
	status: string;
	clientName: string;
	sentAt: string | null;
	completedAt: string | null;
	expiresAt: string | null;
	signers?: Array<{
		id: string;
		name: string;
		email: string;
		role?: string | null;
		status: string;
		signedAt: string | null;
	}>;
};

export function ContractPanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<ContractDetail>
			workspaceId={workspaceId}
			resource="contracts"
			id={id}
			onClose={onClose}
			title={(contract) => contract.title}
			subtitle={(contract) =>
				`${contract.number} · ${titleCase(contract.status)}`
			}
			actions={(contract) => [
				{ label: "Send", path: "send", when: contract.status === "draft" },
				{
					label: "Void",
					path: "void",
					when: contract.status !== "completed" && contract.status !== "void",
				},
				{
					label: "Revise",
					path: "revise",
					when: contract.status === "sent",
				},
			]}
		>
			{(contract) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Customer">{contract.clientName}</Fact>
						<Fact label="Expires">{date(contract.expiresAt)}</Fact>
						<Fact label="Sent">{dateTime(contract.sentAt)}</Fact>
						<Fact label="Completed">{dateTime(contract.completedAt)}</Fact>
					</div>
					<Block title="Signers" aside={contract.signers?.length || undefined}>
						{(contract.signers ?? []).length === 0 ? (
							<BlockEmpty>Nobody has been asked to sign yet.</BlockEmpty>
						) : (
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{(contract.signers ?? []).map((signer) => (
									<div key={signer.id} className="flex items-center gap-3 py-2">
										<div className="min-w-0 flex-1">
											<p className="truncate text-[12.5px] text-[var(--ink-85)]">
												{signer.name}
											</p>
											<p className="truncate text-[11px] text-[var(--ink-30)]">
												{signer.email}
											</p>
										</div>
										<span className="shrink-0 text-[11px] text-[var(--ink-30)] capitalize">
											{titleCase(signer.status)}
										</span>
									</div>
								))}
							</div>
						)}
					</Block>
				</>
			)}
		</RecordPanel>
	);
}

/* ── Documents ────────────────────────────────────────────────────────────── */

type DocumentDetail = {
	id: string;
	title: string;
	status: string;
	description: string | null;
	currentVersionNumber: number | null;
	updatedAt: string;
};

export function DocumentPanel({ workspaceId, id, onClose }: PanelProps) {
	return (
		<RecordPanel<DocumentDetail>
			workspaceId={workspaceId}
			resource="documents"
			id={id}
			onClose={onClose}
			title={(document) => document.title}
			subtitle={(document) =>
				`${titleCase(document.status)}${
					document.currentVersionNumber
						? ` · version ${document.currentVersionNumber}`
						: ""
				}`
			}
			actions={() => []}
		>
			{(document) => (
				<>
					<div className="grid grid-cols-2 gap-3">
						<Fact label="Version">
							{document.currentVersionNumber ?? "None uploaded"}
						</Fact>
						<Fact label="Updated">{dateTime(document.updatedAt)}</Fact>
					</div>
					{document.description ? (
						<Block title="Description">
							<p className="text-[12.5px] text-[var(--ink-85)] leading-5">
								{document.description}
							</p>
						</Block>
					) : null}
				</>
			)}
		</RecordPanel>
	);
}
