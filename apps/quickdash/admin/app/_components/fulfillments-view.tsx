"use client";

import { Handshake, MagnifyingGlass, Plus } from "@phosphor-icons/react";
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
	changeFulfillmentStatusAction,
	createFulfillmentAction,
	deleteFulfillmentAction,
	type FulfillmentActionState,
} from "../_lib/fulfillment-actions";

export type FulfillmentInvoiceOption = {
	id: string;
	number: string;
	clientId: string | null;
	clientName: string | null;
};
export type FulfillmentClientOption = {
	id: string;
	name: string;
	company: string | null;
};
export type FulfillmentViewModel = {
	id: string;
	title: string;
	kind: "physical" | "digital" | "service" | "pickup" | "other";
	status: "pending" | "in_progress" | "fulfilled" | "failed" | "cancelled";
	displayStatus:
		| "pending"
		| "in_progress"
		| "overdue"
		| "fulfilled"
		| "failed"
		| "cancelled";
	clientName: string | null;
	clientCompany: string | null;
	invoiceNumber: string | null;
	instructions: string | null;
	dueDate: string | null;
	fulfilledAt: string | null;
	createdAt: string;
};

const INITIAL_STATE: FulfillmentActionState = {
	error: null,
	completionId: null,
};
const titleCase = (value: string) =>
	value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

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

function NewFulfillmentDialog({
	workspaceId,
	invoices,
	clients,
	defaultKind,
}: {
	workspaceId: string;
	invoices: FulfillmentInvoiceOption[];
	clients: FulfillmentClientOption[];
	defaultKind: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [invoiceId, setInvoiceId] = useState("");
	const [state, action] = useActionState(
		createFulfillmentAction,
		INITIAL_STATE,
	);
	const selected = invoices.find((invoice) => invoice.id === invoiceId);
	// A per-submit idempotency key so a double-fire creates only one fulfillment; a fresh
	// key is minted after each success.
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	useEffect(() => {
		if (!state.completionId) return;
		setOpen(false);
		setInvoiceId("");
		setIdempotencyKey(crypto.randomUUID());
		router.refresh();
	}, [state.completionId, router]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="size-4" />
					New fulfillment
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form action={action} className="space-y-5">
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					<DialogHeader>
						<DialogTitle>Create fulfillment</DialogTitle>
						<DialogDescription>
							Track the real delivery of a product, file, service, pickup, or
							other promise. Creating this record does not perform the delivery
							itself.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="fulfillment-invoice">Paid invoice (optional)</Label>
						<NativeSelect
							id="fulfillment-invoice"
							name="invoiceId"
							value={invoiceId}
							onChange={(event) => setInvoiceId(event.target.value)}
							className="w-full"
						>
							<option value="">No invoice / internal work</option>
							{invoices.map((invoice) => (
								<option key={invoice.id} value={invoice.id}>
									{invoice.number} · {invoice.clientName ?? "No client"}
								</option>
							))}
						</NativeSelect>
						{invoices.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								No paid invoices are waiting for fulfillment.
							</p>
						) : null}
					</div>
					{selected ? (
						<input
							type="hidden"
							name="clientId"
							value={selected.clientId ?? ""}
						/>
					) : (
						<div className="space-y-2">
							<Label htmlFor="fulfillment-client">Client (optional)</Label>
							<NativeSelect
								id="fulfillment-client"
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
					<div className="space-y-2">
						<Label htmlFor="fulfillment-title">
							What needs to be delivered?
						</Label>
						<Input
							id="fulfillment-title"
							name="title"
							maxLength={300}
							placeholder="Deliver completed website"
							required
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="fulfillment-kind">Delivery type</Label>
							<NativeSelect
								id="fulfillment-kind"
								name="kind"
								defaultValue={defaultKind}
								className="w-full"
							>
								<option value="service">Service</option>
								<option value="digital">Digital</option>
								<option value="physical">Physical</option>
								<option value="pickup">Pickup</option>
								<option value="other">Other</option>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fulfillment-due">Due date</Label>
							<Input id="fulfillment-due" name="dueDate" type="date" />
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="fulfillment-instructions">
							Internal instructions
						</Label>
						<Textarea
							id="fulfillment-instructions"
							name="instructions"
							maxLength={10000}
							placeholder="What must happen before this can be marked complete?"
						/>
					</div>
					{state.error ? (
						<p className="text-destructive text-sm">{state.error}</p>
					) : null}
					<DialogFooter>
						<SubmitButton label="Create fulfillment" />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function StatusForm({
	workspaceId,
	id,
	target,
	label,
	variant = "default",
}: {
	workspaceId: string;
	id: string;
	target: string;
	label: string;
	variant?: "default" | "destructive";
}) {
	const router = useRouter();
	const [state, action] = useActionState(
		changeFulfillmentStatusAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) router.refresh();
	}, [state.completionId, router]);
	return (
		<form action={action}>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="fulfillmentId" value={id} />
			<input type="hidden" name="target" value={target} />
			<SubmitButton label={label} variant={variant} />
			{state.error ? (
				<p className="mt-2 text-destructive text-xs">{state.error}</p>
			) : null}
		</form>
	);
}

function FulfillmentDetails({
	workspaceId,
	fulfillment,
	completionLabel,
}: {
	workspaceId: string;
	fulfillment: FulfillmentViewModel;
	completionLabel: string;
}) {
	const router = useRouter();
	const [deleteState, deleteAction] = useActionState(
		deleteFulfillmentAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (deleteState.completionId) router.refresh();
	}, [deleteState.completionId, router]);
	const open =
		fulfillment.status === "pending" || fulfillment.status === "in_progress";
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					View
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{fulfillment.title}</DialogTitle>
					<DialogDescription>
						{titleCase(fulfillment.kind)} fulfillment
						{fulfillment.invoiceNumber
							? ` for ${fulfillment.invoiceNumber}`
							: ""}
					</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
					<div>
						<dt className="text-muted-foreground">Client</dt>
						<dd className="mt-1 font-medium">
							{fulfillment.clientName ?? "Not assigned"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Status</dt>
						<dd className="mt-1 font-medium">
							{titleCase(fulfillment.displayStatus)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Due</dt>
						<dd className="mt-1 font-medium">
							{fulfillment.dueDate
								? new Intl.DateTimeFormat(undefined, {
										dateStyle: "medium",
									}).format(new Date(`${fulfillment.dueDate}T12:00:00Z`))
								: "No due date"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Created</dt>
						<dd className="mt-1 font-medium">
							{new Intl.DateTimeFormat(undefined, {
								dateStyle: "medium",
							}).format(new Date(fulfillment.createdAt))}
						</dd>
					</div>
				</dl>
				{fulfillment.instructions ? (
					<div className="rounded-lg bg-muted/50 p-4">
						<p className="font-medium text-sm">Instructions</p>
						<p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
							{fulfillment.instructions}
						</p>
					</div>
				) : null}
				{open ? (
					<div className="flex flex-wrap gap-2 border-t pt-4">
						{fulfillment.status === "pending" ? (
							<StatusForm
								workspaceId={workspaceId}
								id={fulfillment.id}
								target="in_progress"
								label="Start work"
							/>
						) : null}
						<StatusForm
							workspaceId={workspaceId}
							id={fulfillment.id}
							target="fulfilled"
							label={completionLabel}
						/>
						<StatusForm
							workspaceId={workspaceId}
							id={fulfillment.id}
							target="failed"
							label="Mark failed"
							variant="destructive"
						/>
						<StatusForm
							workspaceId={workspaceId}
							id={fulfillment.id}
							target="cancelled"
							label="Cancel"
							variant="destructive"
						/>
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						This terminal fulfillment history is read-only.
					</p>
				)}
				{fulfillment.status === "pending" ? (
					<form action={deleteAction} className="border-t pt-4">
						<input type="hidden" name="workspaceId" value={workspaceId} />
						<input type="hidden" name="fulfillmentId" value={fulfillment.id} />
						<SubmitButton label="Delete pending record" variant="destructive" />
						{deleteState.error ? (
							<p className="mt-2 text-destructive text-xs">
								{deleteState.error}
							</p>
						) : null}
					</form>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export function FulfillmentsView({
	workspaceId,
	fulfillments,
	invoices,
	clients,
	defaultKind,
	completionLabel,
}: {
	workspaceId: string;
	fulfillments: FulfillmentViewModel[];
	invoices: FulfillmentInvoiceOption[];
	clients: FulfillmentClientOption[];
	defaultKind: string;
	completionLabel: string;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			fulfillments.filter(
				(item) =>
					`${item.title} ${item.clientName ?? ""} ${item.clientCompany ?? ""} ${item.invoiceNumber ?? ""}`
						.toLowerCase()
						.includes(query.toLowerCase()) &&
					(status === "all" ||
						item.displayStatus === status ||
						item.status === status),
			),
		[fulfillments, query, status],
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
							placeholder="Search fulfillment"
							className="pl-9"
						/>
					</div>
					<NativeSelect
						value={status}
						onChange={(event) => setStatus(event.target.value)}
					>
						<option value="all">All statuses</option>
						<option value="pending">Pending</option>
						<option value="in_progress">In progress</option>
						<option value="overdue">Overdue</option>
						<option value="fulfilled">Completed</option>
						<option value="failed">Failed</option>
						<option value="cancelled">Cancelled</option>
					</NativeSelect>
				</div>
				<NewFulfillmentDialog
					workspaceId={workspaceId}
					invoices={invoices}
					clients={clients}
					defaultKind={defaultKind}
				/>
			</div>
			{fulfillments.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Handshake />
						</EmptyMedia>
						<EmptyTitle>Nothing waiting for fulfillment</EmptyTitle>
						<EmptyDescription>
							Create a record when there is real work, delivery, pickup, or
							access to complete.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<NewFulfillmentDialog
							workspaceId={workspaceId}
							invoices={invoices}
							clients={clients}
							defaultKind={defaultKind}
						/>
					</EmptyContent>
				</Empty>
			) : filtered.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>No matching fulfillment</EmptyTitle>
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
								<TableHead>Delivery</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Source</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Due</TableHead>
								<TableHead>Status</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((item) => (
								<TableRow key={item.id}>
									<TableCell className="font-medium">{item.title}</TableCell>
									<TableCell>{item.clientName ?? "Unassigned"}</TableCell>
									<TableCell>{item.invoiceNumber ?? "Manual"}</TableCell>
									<TableCell>{titleCase(item.kind)}</TableCell>
									<TableCell>{item.dueDate ?? "—"}</TableCell>
									<TableCell>
										<Badge
											variant={
												item.status === "failed" || item.status === "cancelled"
													? "destructive"
													: "secondary"
											}
										>
											{item.displayStatus === "fulfilled"
												? completionLabel
												: titleCase(item.displayStatus)}
										</Badge>
									</TableCell>
									<TableCell>
										<FulfillmentDetails
											workspaceId={workspaceId}
											fulfillment={item}
											completionLabel={completionLabel}
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
