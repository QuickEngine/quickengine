"use client";

import { FileText, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
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
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	acceptQuoteAction,
	changeQuoteStatusAction,
	createQuoteAction,
	type QuoteActionState,
	updateQuoteAction,
} from "../_lib/quote-actions";

export type QuoteKind = "quote" | "estimate" | "proposal";
export type QuoteStatus =
	| "draft"
	| "sent"
	| "accepted"
	| "declined"
	| "expired"
	| "superseded"
	| "converted"
	| "voided";

export type QuoteClientOption = {
	id: string;
	name: string;
	company: string | null;
};
export type QuoteLineViewModel = {
	id: string;
	name: string;
	description: string | null;
	quantity: string;
	unitPriceCents: number;
	lineTotalCents: number;
	position: number;
};
export type QuoteViewModel = {
	id: string;
	number: string;
	kind: QuoteKind;
	status: QuoteStatus;
	title: string;
	clientId: string | null;
	clientName: string | null;
	clientEmail: string | null;
	clientCompany: string | null;
	currency: string;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	validUntil: string | null;
	notes: string | null;
	terms: string | null;
	acceptedByName: string | null;
	acceptedByEmail: string | null;
	acceptanceNote: string | null;
	convertedInvoiceId: string | null;
	convertedOrderId: string | null;
	revision: number;
	createdAt: string;
	lines: QuoteLineViewModel[];
};

const INITIAL_STATE: QuoteActionState = { error: null, completionId: null };
const KIND_LABELS: Record<QuoteKind, string> = {
	quote: "Quote",
	estimate: "Estimate",
	proposal: "Proposal",
};

const centsText = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
function formatMoney(cents: number, currency: string) {
	try {
		return new Intl.NumberFormat("en", { style: "currency", currency }).format(
			cents / 100,
		);
	} catch {
		return `${currency} ${centsText(cents)}`;
	}
}
const isExpiredNow = (quote: QuoteViewModel, today: string) =>
	quote.status === "sent" &&
	quote.validUntil !== null &&
	quote.validUntil < today;
const statusVariant = (status: QuoteStatus) =>
	status === "voided" || status === "declined" || status === "expired"
		? ("destructive" as const)
		: ("secondary" as const);

function SubmitButton({
	label,
	variant = "default",
}: {
	label: string;
	variant?: "default" | "destructive" | "outline";
}) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" variant={variant} disabled={pending}>
			{pending ? "Working…" : label}
		</Button>
	);
}

type EditableLine = {
	key: string;
	name: string;
	description: string;
	quantity: string;
	unitPrice: string;
};
const newLine = (): EditableLine => ({
	key: crypto.randomUUID(),
	name: "",
	description: "",
	quantity: "1",
	unitPrice: "0.00",
});

function QuoteFields({
	clients,
	quote,
	defaultCurrency,
	defaultValidUntil,
}: {
	clients: QuoteClientOption[];
	quote?: QuoteViewModel;
	defaultCurrency: string;
	defaultValidUntil: string;
}) {
	const [lines, setLines] = useState<EditableLine[]>(
		quote?.lines.map((line) => ({
			key: line.id,
			name: line.name,
			description: line.description ?? "",
			quantity: line.quantity,
			unitPrice: centsText(line.unitPriceCents),
		})) ?? [newLine()],
	);
	return (
		<div className="grid max-h-[65vh] gap-5 overflow-y-auto py-3 pr-1">
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="space-y-2 sm:col-span-2">
					<Label>Client</Label>
					<NativeSelect
						name="clientId"
						defaultValue={quote?.clientId ?? ""}
						required
					>
						<option value="" disabled>
							Select a client
						</option>
						{clients.map((client) => (
							<option key={client.id} value={client.id}>
								{client.name}
								{client.company ? ` — ${client.company}` : ""}
							</option>
						))}
					</NativeSelect>
				</div>
				<div className="space-y-2">
					<Label>Type</Label>
					{quote ? (
						<>
							<input type="hidden" name="kind" value={quote.kind} />
							<Input value={KIND_LABELS[quote.kind]} disabled />
						</>
					) : (
						<NativeSelect name="kind" defaultValue="quote">
							<option value="quote">Quote</option>
							<option value="estimate">Estimate</option>
							<option value="proposal">Proposal</option>
						</NativeSelect>
					)}
				</div>
			</div>
			<div className="space-y-2">
				<Label>Title</Label>
				<Input
					name="title"
					defaultValue={quote?.title ?? ""}
					placeholder="e.g. Website redesign proposal"
					maxLength={200}
					required
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="space-y-2">
					<Label>Currency</Label>
					<Input
						name="currency"
						defaultValue={quote?.currency ?? defaultCurrency}
						minLength={3}
						maxLength={3}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label>Valid until</Label>
					<Input
						name="validUntil"
						type="date"
						defaultValue={quote?.validUntil ?? defaultValidUntil}
					/>
				</div>
				<div className="space-y-2">
					<Label>Tax amount</Label>
					<Input
						name="tax"
						inputMode="decimal"
						defaultValue={centsText(quote?.taxCents ?? 0)}
						required
					/>
				</div>
			</div>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Line items</Label>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setLines((current) => [...current, newLine()])}
					>
						<Plus className="size-3.5" /> Add line
					</Button>
				</div>
				{lines.map((line, index) => (
					<div
						key={line.key}
						className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_7rem_auto]"
					>
						<div className="space-y-2 sm:col-span-1">
							<Input
								name="lineName"
								aria-label={`Line ${index + 1} name`}
								placeholder="Item"
								value={line.name}
								onChange={(event) =>
									setLines((current) =>
										current.map((item) =>
											item.key === line.key
												? { ...item, name: event.target.value }
												: item,
										),
									)
								}
								maxLength={160}
								required
							/>
							<Input
								name="lineDescription"
								aria-label={`Line ${index + 1} description`}
								placeholder="Description (optional)"
								value={line.description}
								onChange={(event) =>
									setLines((current) =>
										current.map((item) =>
											item.key === line.key
												? { ...item, description: event.target.value }
												: item,
										),
									)
								}
								maxLength={4_000}
							/>
						</div>
						<Input
							name="lineQuantity"
							aria-label={`Line ${index + 1} quantity`}
							inputMode="decimal"
							placeholder="Qty"
							value={line.quantity}
							onChange={(event) =>
								setLines((current) =>
									current.map((item) =>
										item.key === line.key
											? { ...item, quantity: event.target.value }
											: item,
									),
								)
							}
							required
						/>
						<Input
							name="lineUnitPrice"
							aria-label={`Line ${index + 1} unit price`}
							inputMode="decimal"
							value={line.unitPrice}
							onChange={(event) =>
								setLines((current) =>
									current.map((item) =>
										item.key === line.key
											? { ...item, unitPrice: event.target.value }
											: item,
									),
								)
							}
							required
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={`Remove line ${index + 1}`}
							disabled={lines.length === 1}
							onClick={() =>
								setLines((current) =>
									current.filter((item) => item.key !== line.key),
								)
							}
						>
							<Trash className="size-4" />
						</Button>
					</div>
				))}
				<p className="text-muted-foreground text-xs">
					Quantities allow up to three decimals for hours, weights, or measured
					work.
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Notes</Label>
					<Textarea
						name="notes"
						defaultValue={quote?.notes ?? ""}
						maxLength={10_000}
						rows={3}
					/>
				</div>
				<div className="space-y-2">
					<Label>Terms</Label>
					<Textarea
						name="terms"
						defaultValue={quote?.terms ?? ""}
						maxLength={20_000}
						rows={3}
					/>
				</div>
			</div>
		</div>
	);
}

function QuoteEditor({
	workspaceId,
	clients,
	quote,
	defaultCurrency,
	defaultValidUntil,
	trigger,
}: {
	workspaceId: string;
	clients: QuoteClientOption[];
	quote?: QuoteViewModel;
	defaultCurrency: string;
	defaultValidUntil: string;
	trigger: React.ReactNode;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [state, action] = useActionState(
		quote ? updateQuoteAction : createQuoteAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			setIdempotencyKey(crypto.randomUUID());
			router.refresh();
		}
	}, [router, state.completionId]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					{quote ? (
						<input type="hidden" name="quoteId" value={quote.id} />
					) : (
						<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					)}
					<DialogHeader>
						<DialogTitle>
							{quote ? `Edit ${quote.number}` : "Create quote"}
						</DialogTitle>
						<DialogDescription>
							{quote
								? "Only drafts can be changed."
								: "Prepare a draft. Marking it sent locks it as client-facing history."}
						</DialogDescription>
					</DialogHeader>
					<QuoteFields
						clients={clients}
						quote={quote}
						defaultCurrency={defaultCurrency}
						defaultValidUntil={defaultValidUntil}
					/>
					{state.error && (
						<p role="alert" className="mb-3 text-destructive text-sm">
							{state.error}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<SubmitButton label={quote ? "Save draft" : "Create draft"} />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function TransitionForm({
	workspaceId,
	quoteId,
	target,
	label,
	variant = "default",
}: {
	workspaceId: string;
	quoteId: string;
	target: string;
	label: string;
	variant?: "default" | "destructive" | "outline";
}) {
	const router = useRouter();
	const [state, action] = useActionState(
		changeQuoteStatusAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) router.refresh();
	}, [router, state.completionId]);
	return (
		<form action={action}>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="quoteId" value={quoteId} />
			<input type="hidden" name="target" value={target} />
			<SubmitButton label={label} variant={variant} />
			{state.error && (
				<p role="alert" className="mt-2 text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}

function AcceptDialog({
	workspaceId,
	quoteId,
}: {
	workspaceId: string;
	quoteId: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(acceptQuoteAction, INITIAL_STATE);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			router.refresh();
		}
	}, [router, state.completionId]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>Record acceptance</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="quoteId" value={quoteId} />
					<DialogHeader>
						<DialogTitle>Record acceptance</DialogTitle>
						<DialogDescription>
							Capture who accepted on the client's behalf. This is a recorded
							acceptance, not a legal e-signature.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-3">
						<div className="space-y-2">
							<Label>Accepted by (name)</Label>
							<Input name="acceptedByName" maxLength={200} required />
						</div>
						<div className="space-y-2">
							<Label>Email (optional)</Label>
							<Input name="acceptedByEmail" type="email" />
						</div>
						<div className="space-y-2">
							<Label>Note (optional)</Label>
							<Textarea name="acceptanceNote" maxLength={2_000} rows={2} />
						</div>
					</div>
					{state.error && (
						<p role="alert" className="mb-3 text-destructive text-sm">
							{state.error}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<SubmitButton label="Record acceptance" />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function QuoteDetails({
	workspaceId,
	quote,
	clients,
	defaultCurrency,
	defaultValidUntil,
	today,
}: {
	workspaceId: string;
	quote: QuoteViewModel;
	clients: QuoteClientOption[];
	defaultCurrency: string;
	defaultValidUntil: string;
	today: string;
}) {
	const [open, setOpen] = useState(false);
	const expired = isExpiredNow(quote, today);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button type="button" className="font-medium hover:underline">
					{quote.number}
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<div className="flex flex-wrap items-center gap-2">
						<DialogTitle>{quote.number}</DialogTitle>
						<Badge variant="outline">{KIND_LABELS[quote.kind]}</Badge>
						<Badge
							variant={expired ? "destructive" : statusVariant(quote.status)}
						>
							{expired ? "expired" : quote.status}
						</Badge>
					</div>
					<DialogDescription>
						{quote.title} · {quote.clientName ?? "No client snapshot"}
						{quote.clientCompany ? ` — ${quote.clientCompany}` : ""}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Item</TableHead>
									<TableHead>Qty</TableHead>
									<TableHead>Unit</TableHead>
									<TableHead className="text-right">Total</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{quote.lines.map((line) => (
									<TableRow key={line.id}>
										<TableCell>
											<div>{line.name}</div>
											{line.description && (
												<div className="text-muted-foreground text-xs">
													{line.description}
												</div>
											)}
										</TableCell>
										<TableCell>{line.quantity}</TableCell>
										<TableCell>
											{formatMoney(line.unitPriceCents, quote.currency)}
										</TableCell>
										<TableCell className="text-right">
											{formatMoney(line.lineTotalCents, quote.currency)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<div className="ml-auto grid max-w-xs grid-cols-2 gap-2 text-sm">
						<span className="text-muted-foreground">Subtotal</span>
						<span className="text-right">
							{formatMoney(quote.subtotalCents, quote.currency)}
						</span>
						<span className="text-muted-foreground">Tax</span>
						<span className="text-right">
							{formatMoney(quote.taxCents, quote.currency)}
						</span>
						<span className="font-medium">Total</span>
						<span className="text-right font-medium">
							{formatMoney(quote.totalCents, quote.currency)}
						</span>
					</div>
					{quote.validUntil && (
						<p className="text-muted-foreground text-sm">
							Valid until {quote.validUntil}
						</p>
					)}
					{quote.acceptedByName && (
						<p className="rounded-lg bg-muted/40 p-3 text-sm">
							Accepted by {quote.acceptedByName}
							{quote.acceptedByEmail ? ` (${quote.acceptedByEmail})` : ""}.
							{quote.acceptanceNote ? ` “${quote.acceptanceNote}”` : ""}
						</p>
					)}
					{quote.status === "converted" && (
						<p className="rounded-lg bg-muted/40 p-3 text-sm">
							Converted to{" "}
							{quote.convertedInvoiceId ? "an invoice" : "an order"}.
						</p>
					)}
					{quote.notes && (
						<p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
							{quote.notes}
						</p>
					)}
				</div>
				<DialogFooter className="flex-wrap items-end gap-2 sm:justify-end">
					{quote.status === "draft" && (
						<>
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="delete"
								label="Delete draft"
								variant="destructive"
							/>
							<QuoteEditor
								workspaceId={workspaceId}
								clients={clients}
								quote={quote}
								defaultCurrency={defaultCurrency}
								defaultValidUntil={defaultValidUntil}
								trigger={<Button variant="outline">Edit draft</Button>}
							/>
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="sent"
								label="Mark as sent"
							/>
						</>
					)}
					{quote.status === "sent" && (
						<>
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="void"
								label="Void"
								variant="destructive"
							/>
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="decline"
								label="Mark declined"
								variant="outline"
							/>
							{expired && (
								<TransitionForm
									workspaceId={workspaceId}
									quoteId={quote.id}
									target="expire"
									label="Mark expired"
									variant="outline"
								/>
							)}
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="revise"
								label="Revise"
								variant="outline"
							/>
							<AcceptDialog workspaceId={workspaceId} quoteId={quote.id} />
						</>
					)}
					{quote.status === "accepted" && (
						<>
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="void"
								label="Void"
								variant="destructive"
							/>
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="revise"
								label="Revise"
								variant="outline"
							/>
							{quote.taxCents === 0 && (
								<TransitionForm
									workspaceId={workspaceId}
									quoteId={quote.id}
									target="convert-order"
									label="Convert to order"
									variant="outline"
								/>
							)}
							<TransitionForm
								workspaceId={workspaceId}
								quoteId={quote.id}
								target="convert-invoice"
								label="Convert to invoice"
							/>
						</>
					)}
					{(quote.status === "declined" || quote.status === "expired") && (
						<TransitionForm
							workspaceId={workspaceId}
							quoteId={quote.id}
							target="revise"
							label="Revise"
							variant="outline"
						/>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function QuotesView({
	workspaceId,
	quotes,
	clients,
	defaultCurrency,
	defaultValidUntil,
	today,
}: {
	workspaceId: string;
	quotes: QuoteViewModel[];
	clients: QuoteClientOption[];
	defaultCurrency: string;
	defaultValidUntil: string;
	today: string;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const [kind, setKind] = useState("all");
	const visible = useMemo(
		() =>
			quotes.filter(
				(quote) =>
					(status === "all" || quote.status === status) &&
					(kind === "all" || quote.kind === kind) &&
					[quote.number, quote.title, quote.clientName, quote.clientCompany]
						.filter(Boolean)
						.join(" ")
						.toLowerCase()
						.includes(query.trim().toLowerCase()),
			),
		[quotes, query, status, kind],
	);
	const create = (
		<QuoteEditor
			workspaceId={workspaceId}
			clients={clients}
			defaultCurrency={defaultCurrency}
			defaultValidUntil={defaultValidUntil}
			trigger={
				<Button disabled={clients.length === 0}>
					<Plus className="size-4" /> Create quote
				</Button>
			}
		/>
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-1 flex-wrap gap-2">
					<div className="relative w-full max-w-sm">
						<MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search quotes…"
							className="pl-9"
						/>
					</div>
					<NativeSelect
						value={kind}
						onChange={(event) => setKind(event.target.value)}
						className="w-36"
					>
						<option value="all">All types</option>
						<option value="quote">Quotes</option>
						<option value="estimate">Estimates</option>
						<option value="proposal">Proposals</option>
					</NativeSelect>
					<NativeSelect
						value={status}
						onChange={(event) => setStatus(event.target.value)}
						className="w-40"
					>
						<option value="all">All statuses</option>
						<option value="draft">Draft</option>
						<option value="sent">Sent</option>
						<option value="accepted">Accepted</option>
						<option value="declined">Declined</option>
						<option value="expired">Expired</option>
						<option value="superseded">Superseded</option>
						<option value="converted">Converted</option>
						<option value="voided">Voided</option>
					</NativeSelect>
				</div>
				{create}
			</div>
			{clients.length === 0 && (
				<p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
					Create a Client Record before preparing a quote.
				</p>
			)}
			{quotes.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FileText />
						</EmptyMedia>
						<EmptyTitle>No quotes yet</EmptyTitle>
						<EmptyDescription>
							Prepare a quote, estimate, or proposal for a client, then send it
							and convert it to an invoice or order once accepted.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>{create}</EmptyContent>
				</Empty>
			) : visible.length === 0 ? (
				<div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
					No quotes match these filters.
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-4">Number</TableHead>
								<TableHead>Title</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="pr-4 text-right">Total</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visible.map((quote) => {
								const expired = isExpiredNow(quote, today);
								return (
									<TableRow key={quote.id}>
										<TableCell className="pl-4">
											<QuoteDetails
												workspaceId={workspaceId}
												quote={quote}
												clients={clients}
												defaultCurrency={defaultCurrency}
												defaultValidUntil={defaultValidUntil}
												today={today}
											/>
										</TableCell>
										<TableCell className="max-w-[16rem] truncate">
											{quote.title}
										</TableCell>
										<TableCell>{quote.clientName ?? "—"}</TableCell>
										<TableCell>
											<Badge
												variant={
													expired ? "destructive" : statusVariant(quote.status)
												}
											>
												{expired ? "expired" : quote.status}
											</Badge>
										</TableCell>
										<TableCell className="pr-4 text-right">
											{formatMoney(quote.totalCents, quote.currency)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}
