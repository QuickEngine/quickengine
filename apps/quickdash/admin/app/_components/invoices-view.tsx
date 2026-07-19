"use client";

import { Invoice, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
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
	changeInvoiceStatusAction,
	createInvoiceAction,
	deleteInvoiceAction,
	type InvoiceActionState,
	updateInvoiceAction,
} from "../_lib/invoice-actions";

export type InvoiceClientOption = {
	id: string;
	name: string;
	company: string | null;
};
export type InvoiceLineViewModel = {
	id: string;
	description: string;
	quantity: number;
	unitPriceCents: number;
	position: number;
	sourceModule: string | null;
};
export type InvoiceViewModel = {
	id: string;
	number: string;
	status: "draft" | "sent" | "paid" | "void";
	displayStatus: "draft" | "issued" | "overdue" | "paid" | "void";
	clientId: string | null;
	clientName: string | null;
	clientEmail: string | null;
	clientCompany: string | null;
	currency: string;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	notes: string | null;
	dueDate: string | null;
	issuedAt: string | null;
	paidAt: string | null;
	createdAt: string;
	lineItems: InvoiceLineViewModel[];
};

const INITIAL_STATE: InvoiceActionState = { error: null, completionId: null };

function SubmitButton({
	label,
	variant = "default",
}: {
	label: string;
	variant?: "default" | "destructive";
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
	description: string;
	quantity: string;
	unitPrice: string;
};
const newLine = (): EditableLine => ({
	key: crypto.randomUUID(),
	description: "",
	quantity: "1",
	unitPrice: "0.00",
});
const centsText = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

function InvoiceFields({
	clients,
	invoice,
	defaultCurrency,
	defaultDueDate,
}: {
	clients: InvoiceClientOption[];
	invoice?: InvoiceViewModel;
	defaultCurrency: string;
	defaultDueDate: string;
}) {
	const [lines, setLines] = useState<EditableLine[]>(
		invoice?.lineItems.map((line) => ({
			key: line.id,
			description: line.description,
			quantity: String(line.quantity),
			unitPrice: centsText(line.unitPriceCents),
		})) ?? [newLine()],
	);
	const managed =
		invoice?.lineItems.some((line) => line.sourceModule !== null) ?? false;
	return (
		<div className="grid max-h-[65vh] gap-5 overflow-y-auto py-3 pr-1">
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="space-y-2 sm:col-span-2">
					<Label>Client</Label>
					<NativeSelect
						name="clientId"
						defaultValue={invoice?.clientId ?? ""}
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
					<Label>Currency</Label>
					<Input
						name="currency"
						defaultValue={invoice?.currency ?? defaultCurrency}
						minLength={3}
						maxLength={3}
						required
					/>
				</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Due date</Label>
					<Input
						name="dueDate"
						type="date"
						defaultValue={invoice?.dueDate ?? defaultDueDate}
					/>
				</div>
				<div className="space-y-2">
					<Label>Tax amount</Label>
					<Input
						name="tax"
						inputMode="decimal"
						defaultValue={centsText(invoice?.taxCents ?? 0)}
						required
					/>
				</div>
			</div>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Line items</Label>
					{!managed && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setLines((current) => [...current, newLine()])}
						>
							<Plus className="size-3.5" /> Add line
						</Button>
					)}
				</div>
				{managed && (
					<p className="rounded-md border p-3 text-muted-foreground text-sm">
						This draft contains lines managed by another module. Edit those
						records at their source.
					</p>
				)}
				{lines.map((line, index) => (
					<div
						key={line.key}
						className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_6rem_8rem_auto]"
					>
						<Input
							name="lineDescription"
							aria-label={`Line ${index + 1} description`}
							placeholder="Description"
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
							maxLength={500}
							disabled={managed}
							required
						/>
						<Input
							name="lineQuantity"
							aria-label={`Line ${index + 1} quantity`}
							type="number"
							min={1}
							max={1_000_000}
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
							disabled={managed}
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
							disabled={managed}
							required
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={`Remove line ${index + 1}`}
							disabled={managed || lines.length === 1}
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
			</div>
			<div className="space-y-2">
				<Label>Notes</Label>
				<Textarea
					name="notes"
					defaultValue={invoice?.notes ?? ""}
					maxLength={10_000}
					rows={3}
				/>
			</div>
		</div>
	);
}

function InvoiceEditor({
	workspaceId,
	clients,
	invoice,
	defaultCurrency,
	defaultDueDate,
	trigger,
}: {
	workspaceId: string;
	clients: InvoiceClientOption[];
	invoice?: InvoiceViewModel;
	defaultCurrency: string;
	defaultDueDate: string;
	trigger: React.ReactNode;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [state, action] = useActionState(
		invoice ? updateInvoiceAction : createInvoiceAction,
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
					{invoice ? (
						<input type="hidden" name="invoiceId" value={invoice.id} />
					) : (
						<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					)}
					<DialogHeader>
						<DialogTitle>
							{invoice ? `Edit ${invoice.number}` : "Create invoice"}
						</DialogTitle>
						<DialogDescription>
							{invoice
								? "Only drafts can be changed."
								: "Prepare a draft. Issuing it later locks its financial history."}
						</DialogDescription>
					</DialogHeader>
					<InvoiceFields
						clients={clients}
						invoice={invoice}
						defaultCurrency={defaultCurrency}
						defaultDueDate={defaultDueDate}
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
						<SubmitButton label={invoice ? "Save draft" : "Create draft"} />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function LifecycleForm({
	workspaceId,
	invoiceId,
	target,
	label,
	destructive = false,
}: {
	workspaceId: string;
	invoiceId: string;
	target: "sent" | "void";
	label: string;
	destructive?: boolean;
}) {
	const router = useRouter();
	const [state, action] = useActionState(
		changeInvoiceStatusAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) router.refresh();
	}, [router, state.completionId]);
	return (
		<form action={action}>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="invoiceId" value={invoiceId} />
			<input type="hidden" name="target" value={target} />
			<SubmitButton
				label={label}
				variant={destructive ? "destructive" : "default"}
			/>
			{state.error && (
				<p role="alert" className="mt-2 text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}

function InvoiceDetails({
	workspaceId,
	invoice,
	clients,
	defaultCurrency,
	defaultDueDate,
}: {
	workspaceId: string;
	invoice: InvoiceViewModel;
	clients: InvoiceClientOption[];
	defaultCurrency: string;
	defaultDueDate: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [deleteState, deleteAction] = useActionState(
		deleteInvoiceAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (deleteState.completionId) {
			setOpen(false);
			router.refresh();
		}
	}, [deleteState.completionId, router]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button type="button" className="font-medium hover:underline">
					{invoice.number}
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<div className="flex items-center gap-2">
						<DialogTitle>{invoice.number}</DialogTitle>
						<Badge
							variant={
								invoice.displayStatus === "overdue"
									? "destructive"
									: "secondary"
							}
						>
							{invoice.displayStatus}
						</Badge>
					</div>
					<DialogDescription>
						{invoice.clientName ?? "No client snapshot"}
						{invoice.clientCompany ? ` — ${invoice.clientCompany}` : ""}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Description</TableHead>
									<TableHead>Qty</TableHead>
									<TableHead>Unit</TableHead>
									<TableHead className="text-right">Total</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invoice.lineItems.map((line) => (
									<TableRow key={line.id}>
										<TableCell>{line.description}</TableCell>
										<TableCell>{line.quantity}</TableCell>
										<TableCell>
											{formatMoney(line.unitPriceCents, invoice.currency)}
										</TableCell>
										<TableCell className="text-right">
											{formatMoney(
												line.quantity * line.unitPriceCents,
												invoice.currency,
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<div className="ml-auto grid max-w-xs grid-cols-2 gap-2 text-sm">
						<span className="text-muted-foreground">Subtotal</span>
						<span className="text-right">
							{formatMoney(invoice.subtotalCents, invoice.currency)}
						</span>
						<span className="text-muted-foreground">Tax</span>
						<span className="text-right">
							{formatMoney(invoice.taxCents, invoice.currency)}
						</span>
						<span className="font-medium">Total</span>
						<span className="text-right font-medium">
							{formatMoney(invoice.totalCents, invoice.currency)}
						</span>
					</div>
					{invoice.notes && (
						<p className="rounded-lg bg-muted/40 p-3 text-sm whitespace-pre-wrap">
							{invoice.notes}
						</p>
					)}
				</div>
				<DialogFooter className="items-end justify-between sm:justify-between">
					{invoice.status === "draft" ? (
						<form action={deleteAction}>
							<input type="hidden" name="workspaceId" value={workspaceId} />
							<input type="hidden" name="invoiceId" value={invoice.id} />
							<SubmitButton label="Delete draft" variant="destructive" />
							{deleteState.error && (
								<p className="mt-2 text-destructive text-xs">
									{deleteState.error}
								</p>
							)}
						</form>
					) : invoice.status === "sent" ? (
						<LifecycleForm
							workspaceId={workspaceId}
							invoiceId={invoice.id}
							target="void"
							label="Void invoice"
							destructive
						/>
					) : (
						<span />
					)}
					<div className="flex gap-2">
						{invoice.status === "draft" &&
							!invoice.lineItems.some((line) => line.sourceModule !== null) && (
								<InvoiceEditor
									workspaceId={workspaceId}
									clients={clients}
									invoice={invoice}
									defaultCurrency={defaultCurrency}
									defaultDueDate={defaultDueDate}
									trigger={<Button variant="outline">Edit draft</Button>}
								/>
							)}
						{invoice.status === "draft" && (
							<LifecycleForm
								workspaceId={workspaceId}
								invoiceId={invoice.id}
								target="sent"
								label="Issue invoice"
							/>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function formatMoney(cents: number, currency: string) {
	try {
		return new Intl.NumberFormat("en", { style: "currency", currency }).format(
			cents / 100,
		);
	} catch {
		return `${currency} ${centsText(cents)}`;
	}
}

export function InvoicesView({
	workspaceId,
	invoices,
	clients,
	defaultCurrency,
	defaultDueDate,
}: {
	workspaceId: string;
	invoices: InvoiceViewModel[];
	clients: InvoiceClientOption[];
	defaultCurrency: string;
	defaultDueDate: string;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const visible = useMemo(
		() =>
			invoices.filter(
				(invoice) =>
					(status === "all" || invoice.displayStatus === status) &&
					[
						invoice.number,
						invoice.clientName,
						invoice.clientEmail,
						invoice.clientCompany,
					]
						.filter(Boolean)
						.join(" ")
						.toLowerCase()
						.includes(query.trim().toLowerCase()),
			),
		[invoices, query, status],
	);
	const create = (
		<InvoiceEditor
			workspaceId={workspaceId}
			clients={clients}
			defaultCurrency={defaultCurrency}
			defaultDueDate={defaultDueDate}
			trigger={
				<Button disabled={clients.length === 0}>
					<Plus className="size-4" /> Create invoice
				</Button>
			}
		/>
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-1 gap-2">
					<div className="relative w-full max-w-sm">
						<MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search invoices…"
							className="pl-9"
						/>
					</div>
					<NativeSelect
						value={status}
						onChange={(event) => setStatus(event.target.value)}
						className="w-36"
					>
						<option value="all">All statuses</option>
						<option value="draft">Draft</option>
						<option value="issued">Issued</option>
						<option value="overdue">Overdue</option>
						<option value="paid">Paid</option>
						<option value="void">Void</option>
					</NativeSelect>
				</div>
				{create}
			</div>
			{clients.length === 0 && (
				<p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
					Create a Client Record before preparing an invoice.
				</p>
			)}
			{invoices.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Invoice />
						</EmptyMedia>
						<EmptyTitle>No invoices yet</EmptyTitle>
						<EmptyDescription>
							Create a draft for a client, review it, then issue it when the
							details are final.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>{create}</EmptyContent>
				</Empty>
			) : visible.length === 0 ? (
				<div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
					No invoices match these filters.
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-4">Invoice</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Due</TableHead>
								<TableHead className="text-right pr-4">Total</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visible.map((invoice) => (
								<TableRow key={invoice.id}>
									<TableCell className="pl-4">
										<InvoiceDetails
											workspaceId={workspaceId}
											invoice={invoice}
											clients={clients}
											defaultCurrency={defaultCurrency}
											defaultDueDate={defaultDueDate}
										/>
									</TableCell>
									<TableCell>{invoice.clientName ?? "—"}</TableCell>
									<TableCell>
										<Badge
											variant={
												invoice.displayStatus === "overdue"
													? "destructive"
													: "secondary"
											}
										>
											{invoice.displayStatus}
										</Badge>
									</TableCell>
									<TableCell>{invoice.dueDate ?? "—"}</TableCell>
									<TableCell className="text-right pr-4">
										{formatMoney(invoice.totalCents, invoice.currency)}
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
