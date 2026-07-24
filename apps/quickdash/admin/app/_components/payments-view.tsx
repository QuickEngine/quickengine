"use client";

import { CurrencyDollar, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@quickengine/ui/components/ui/dialog";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@quickengine/ui/components/ui/empty";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@quickengine/ui/components/ui/table";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { formatDate, formatMoney } from "@quickengine/ui/lib/format";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type PaymentActionState,
	recordOfflinePaymentAction,
	refundOfflinePaymentAction,
} from "../_lib/payment-actions";

export type PaymentInvoiceOption = {
	id: string;
	number: string;
	clientId: string | null;
	clientName: string | null;
	currency: string;
	totalCents: number;
	netPaidCents: number;
};

export type PaymentClientOption = {
	id: string;
	name: string;
	company: string | null;
};
export type PaymentViewModel = {
	id: string;
	invoiceId: string | null;
	invoiceNumber: string | null;
	clientName: string | null;
	clientCompany: string | null;
	amountCents: number;
	refundedCents: number;
	currency: string;
	status:
		| "pending"
		| "processing"
		| "succeeded"
		| "failed"
		| "disputed"
		| "refunded";
	provider: string;
	paymentMethod: string;
	reference: string | null;
	notes: string | null;
	createdAt: string;
	refunds: Array<{
		id: string;
		amountCents: number;
		reason: string | null;
		createdAt: string;
	}>;
};

const INITIAL_STATE: PaymentActionState = { error: null, completionId: null };
const money = formatMoney;
const titleCase = (value: string) =>
	value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function SubmitButton({ label }: { label: string }) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Working…" : label}
		</Button>
	);
}

function RecordPaymentDialog({
	workspaceId,
	invoices,
	clients,
	defaultCurrency,
}: {
	workspaceId: string;
	invoices: PaymentInvoiceOption[];
	clients: PaymentClientOption[];
	defaultCurrency: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [invoiceId, setInvoiceId] = useState("");
	const [amount, setAmount] = useState("");
	// Per-submit idempotency key so a double-fire records the payment once; fresh after success.
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [state, action] = useActionState(
		recordOfflinePaymentAction,
		INITIAL_STATE,
	);
	const selected = invoices.find((invoice) => invoice.id === invoiceId);
	useEffect(() => {
		if (!state.completionId) return;
		setOpen(false);
		setInvoiceId("");
		setAmount("");
		setIdempotencyKey(crypto.randomUUID());
		router.refresh();
	}, [state.completionId, router]);
	const remaining = selected
		? Math.max(0, selected.totalCents - selected.netPaidCents)
		: null;
	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setInvoiceId("");
					setAmount("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button>
					<Plus className="size-4" />
					Record payment
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form action={action} className="space-y-5">
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					<DialogHeader>
						<DialogTitle>Record an offline payment</DialogTitle>
						<DialogDescription>
							Use this for cash, checks, bank transfers, or another payment
							completed outside QuickDash.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="payment-invoice">Invoice (optional)</Label>
						<NativeSelect
							id="payment-invoice"
							name="invoiceId"
							value={invoiceId}
							onChange={(event) => {
								setInvoiceId(event.target.value);
								setAmount("");
							}}
							className="w-full"
						>
							<option value="">No invoice</option>
							{invoices.map((invoice) => (
								<option key={invoice.id} value={invoice.id}>
									{invoice.number} · {invoice.clientName ?? "No client"} ·{" "}
									{money(
										Math.max(0, invoice.totalCents - invoice.netPaidCents),
										invoice.currency,
									)}{" "}
									remaining
								</option>
							))}
						</NativeSelect>
					</div>
					{selected ? (
						<input
							type="hidden"
							name="clientId"
							value={selected.clientId ?? ""}
						/>
					) : (
						<div className="space-y-2">
							<Label htmlFor="payment-client">Client (optional)</Label>
							<NativeSelect
								id="payment-client"
								name="clientId"
								className="w-full"
							>
								<option value="">No client</option>
								{clients.map((client) => (
									<option key={client.id} value={client.id}>
										{client.name}
										{client.company ? ` · ${client.company}` : ""}
									</option>
								))}
							</NativeSelect>
						</div>
					)}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="payment-amount">Amount</Label>
							<Input
								id="payment-amount"
								name="amount"
								inputMode="decimal"
								placeholder="0.00"
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								required
							/>
							{selected && remaining !== null ? (
								<p className="text-muted-foreground text-xs">
									{money(remaining, selected.currency)} remains on this invoice.
									Enter the amount actually received.
								</p>
							) : null}
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-currency">Currency</Label>
							<Input
								id="payment-currency"
								name="currency"
								maxLength={3}
								defaultValue={selected?.currency ?? defaultCurrency}
								key={selected?.currency ?? defaultCurrency}
								readOnly={Boolean(selected)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-method">Method</Label>
							<NativeSelect
								id="payment-method"
								name="paymentMethod"
								className="w-full"
							>
								<option value="cash">Cash</option>
								<option value="check">Check</option>
								<option value="bank_transfer">Bank transfer</option>
								<option value="card_external">External card</option>
								<option value="other">Other</option>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-reference">Reference</Label>
							<Input
								id="payment-reference"
								name="reference"
								maxLength={255}
								placeholder="Receipt, check, or transfer ID"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="payment-notes">Internal notes</Label>
						<Textarea id="payment-notes" name="notes" maxLength={10000} />
					</div>
					{state.error ? (
						<p className="text-destructive text-sm">{state.error}</p>
					) : null}
					<DialogFooter>
						<SubmitButton label="Record payment" />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function PaymentDetails({
	workspaceId,
	payment,
}: {
	workspaceId: string;
	payment: PaymentViewModel;
}) {
	const router = useRouter();
	const refundable =
		payment.provider === "manual" &&
		payment.status === "succeeded" &&
		payment.amountCents > payment.refundedCents;
	const [state, action] = useActionState(
		refundOfflinePaymentAction,
		INITIAL_STATE,
	);
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	useEffect(() => {
		if (state.completionId) {
			router.refresh();
			setIdempotencyKey(crypto.randomUUID());
		}
	}, [state.completionId, router]);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					View
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{money(payment.amountCents, payment.currency)} payment
					</DialogTitle>
					<DialogDescription>
						{payment.invoiceNumber
							? `Applied to ${payment.invoiceNumber}`
							: "Standalone payment"}
					</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
					<div>
						<dt className="text-muted-foreground">Client</dt>
						<dd className="mt-1 font-medium">
							{payment.clientName ?? "Not assigned"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Status</dt>
						<dd className="mt-1 font-medium">{titleCase(payment.status)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Method</dt>
						<dd className="mt-1 font-medium">
							{titleCase(payment.paymentMethod)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Provider</dt>
						<dd className="mt-1 font-medium">{titleCase(payment.provider)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Reference</dt>
						<dd className="mt-1 font-medium">{payment.reference ?? "—"}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Refunded</dt>
						<dd className="mt-1 font-medium">
							{money(payment.refundedCents, payment.currency)}
						</dd>
					</div>
				</dl>
				{payment.notes ? (
					<p className="rounded-lg bg-muted/50 p-3 text-sm">{payment.notes}</p>
				) : null}
				{payment.refunds.length ? (
					<div>
						<h3 className="mb-2 font-medium text-sm">Refund history</h3>
						{payment.refunds.map((refund) => (
							<div
								className="flex justify-between border-t py-2 text-sm"
								key={refund.id}
							>
								<span>{refund.reason ?? "Refund"}</span>
								<span>{money(refund.amountCents, payment.currency)}</span>
							</div>
						))}
					</div>
				) : null}
				{refundable ? (
					<form action={action} className="space-y-3 border-t pt-4">
						<input type="hidden" name="workspaceId" value={workspaceId} />
						<input type="hidden" name="paymentId" value={payment.id} />
						<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
						<p className="font-medium text-sm">Record refund</p>
						<div className="grid gap-3 sm:grid-cols-2">
							<Input
								name="amount"
								inputMode="decimal"
								placeholder="Amount"
								required
							/>
							<Input
								name="reason"
								maxLength={1000}
								placeholder="Reason (optional)"
							/>
						</div>
						{state.error ? (
							<p className="text-destructive text-sm">{state.error}</p>
						) : null}
						<SubmitButton label="Record refund" />
					</form>
				) : payment.provider !== "manual" && payment.status === "succeeded" ? (
					<p className="text-muted-foreground text-sm">
						Refund this payment through its connected provider so the money
						movement and QuickDash record stay consistent.
					</p>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export function PaymentsView({
	workspaceId,
	payments,
	invoices,
	clients,
	defaultCurrency,
}: {
	workspaceId: string;
	payments: PaymentViewModel[];
	invoices: PaymentInvoiceOption[];
	clients: PaymentClientOption[];
	defaultCurrency: string;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			payments.filter((payment) => {
				const haystack =
					`${payment.clientName ?? ""} ${payment.clientCompany ?? ""} ${payment.invoiceNumber ?? ""} ${payment.reference ?? ""}`.toLowerCase();
				return (
					haystack.includes(query.toLowerCase()) &&
					(status === "all" || payment.status === status)
				);
			}),
		[payments, query, status],
	);
	return (
		<section className="mt-8 space-y-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-1 gap-3">
					<div className="relative max-w-md flex-1">
						<MagnifyingGlass className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search payments"
							className="pl-9"
						/>
					</div>
					<NativeSelect
						value={status}
						onChange={(event) => setStatus(event.target.value)}
					>
						<option value="all">All statuses</option>
						<option value="pending">Pending</option>
						<option value="processing">Processing</option>
						<option value="succeeded">Succeeded</option>
						<option value="failed">Failed</option>
						<option value="disputed">Disputed</option>
						<option value="refunded">Refunded</option>
					</NativeSelect>
				</div>
				<RecordPaymentDialog
					workspaceId={workspaceId}
					invoices={invoices}
					clients={clients}
					defaultCurrency={defaultCurrency}
				/>
			</div>
			{invoices.length > 0 ? (
				<div className="rounded-xl border">
					<div className="border-b px-4 py-3">
						<h2 className="font-medium text-sm">Open invoice balances</h2>
						<p className="mt-1 text-muted-foreground text-xs">
							Successful payments reduce these balances. An invoice becomes paid
							only when its remaining balance reaches zero.
						</p>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Invoice</TableHead>
								<TableHead>Client</TableHead>
								<TableHead className="text-right">Total</TableHead>
								<TableHead className="text-right">Collected</TableHead>
								<TableHead className="text-right">Remaining</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{invoices.map((invoice) => (
								<TableRow key={invoice.id}>
									<TableCell className="font-medium">
										{invoice.number}
									</TableCell>
									<TableCell>{invoice.clientName ?? "No client"}</TableCell>
									<TableCell className="text-right">
										{money(invoice.totalCents, invoice.currency)}
									</TableCell>
									<TableCell className="text-right">
										{money(invoice.netPaidCents, invoice.currency)}
									</TableCell>
									<TableCell className="text-right font-semibold">
										{money(
											Math.max(0, invoice.totalCents - invoice.netPaidCents),
											invoice.currency,
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}
			{payments.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CurrencyDollar />
						</EmptyMedia>
						<EmptyTitle>No payments yet</EmptyTitle>
						<EmptyDescription>
							Record completed offline payments here. Connected-provider
							collection comes later.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<RecordPaymentDialog
							workspaceId={workspaceId}
							invoices={invoices}
							clients={clients}
							defaultCurrency={defaultCurrency}
						/>
					</EmptyContent>
				</Empty>
			) : filtered.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>No matching payments</EmptyTitle>
						<EmptyDescription>
							Try changing the search or status filter.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="overflow-hidden rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Invoice</TableHead>
								<TableHead>Method</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Net</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((payment) => (
								<TableRow key={payment.id}>
									<TableCell>{formatDate(payment.createdAt)}</TableCell>
									<TableCell>
										<p className="font-medium">
											{payment.clientName ?? "Unassigned"}
										</p>
										{payment.clientCompany ? (
											<p className="text-muted-foreground text-xs">
												{payment.clientCompany}
											</p>
										) : null}
									</TableCell>
									<TableCell>{payment.invoiceNumber ?? "—"}</TableCell>
									<TableCell>{titleCase(payment.paymentMethod)}</TableCell>
									<TableCell>
										<Badge
											variant={
												payment.status === "failed" ||
												payment.status === "disputed"
													? "destructive"
													: "secondary"
											}
										>
											{titleCase(payment.status)}
										</Badge>
									</TableCell>
									<TableCell className="text-right font-medium">
										{money(
											payment.amountCents - payment.refundedCents,
											payment.currency,
										)}
									</TableCell>
									<TableCell>
										<PaymentDetails
											workspaceId={workspaceId}
											payment={payment}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}
