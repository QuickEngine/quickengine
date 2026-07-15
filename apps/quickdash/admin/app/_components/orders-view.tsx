"use client";

import { MagnifyingGlass, Package, Plus, Trash } from "@phosphor-icons/react";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	changeOrderStatusAction,
	deleteOrderAction,
	type OrderActionState,
	saveOrderAction,
} from "../_lib/order-actions";

type OrderStatus =
	| "draft"
	| "placed"
	| "confirmed"
	| "processing"
	| "fulfilled"
	| "cancelled";
export type OrderLineViewModel = {
	id: string;
	catalogItemId: string | null;
	catalogItemVariantId: string | null;
	name: string;
	type: "physical" | "digital" | "service" | "package" | "rental";
	sku: string | null;
	quantity: number;
	unitPriceCents: number;
	lineTotalCents: number;
	variantOptions: Array<{ name: string; value: string }>;
};
export type OrderViewModel = {
	id: string;
	number: string;
	status: OrderStatus;
	clientId: string | null;
	clientName: string;
	clientEmail: string | null;
	currency: string;
	totalCents: number;
	notes: string | null;
	fulfillmentId: string | null;
	createdAt: string;
	lines: OrderLineViewModel[];
};
export type OrderCatalogChoice = {
	value: string;
	label: string;
	priceCents: number | null;
	currency: string;
	type: OrderLineViewModel["type"];
	sku: string | null;
};
export type OrderClientChoice = {
	id: string;
	name: string;
	company: string | null;
};

const INITIAL: OrderActionState = { error: null, completionId: null };
const centsText = (value: number) =>
	`${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
const money = (value: number, currency: string) =>
	new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
		value / 100,
	);
const title = (value: string) =>
	value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function Submit({
	children,
	destructive = false,
}: {
	children: React.ReactNode;
	destructive?: boolean;
}) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant={destructive ? "destructive" : "default"}
			disabled={pending}
		>
			{pending ? "Working…" : children}
		</Button>
	);
}

type EditableLine = {
	key: string;
	selection: string;
	name: string;
	type: OrderLineViewModel["type"];
	sku: string;
	quantity: string;
	price: string;
};
const blankLine = (): EditableLine => ({
	key: crypto.randomUUID(),
	selection: "",
	name: "",
	type: "physical",
	sku: "",
	quantity: "1",
	price: "",
});

function OrderFields({
	order,
	clients,
	catalog,
	defaultCurrency,
}: {
	order?: OrderViewModel;
	clients: OrderClientChoice[];
	catalog: OrderCatalogChoice[];
	defaultCurrency: string;
}) {
	const [currency, setCurrency] = useState(order?.currency ?? defaultCurrency);
	const [lines, setLines] = useState<EditableLine[]>(
		order?.lines.map((line) => ({
			key: line.id,
			selection: line.catalogItemId
				? `${line.catalogItemId}::${line.catalogItemVariantId ?? ""}`
				: `custom::${line.id}`,
			name: line.name,
			type: line.type,
			sku: line.sku ?? "",
			quantity: String(line.quantity),
			price: centsText(line.unitPriceCents),
		})) ?? [blankLine()],
	);
	function update(key: string, patch: Partial<EditableLine>) {
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
		);
	}
	function select(line: EditableLine, selection: string) {
		if (selection === "custom") {
			update(line.key, { selection: `custom::${line.key}` });
			return;
		}
		const choice = catalog.find((item) => item.value === selection);
		if (!choice) return;
		update(line.key, {
			selection,
			name: choice.label,
			type: choice.type,
			sku: choice.sku ?? "",
			price: choice.priceCents === null ? "" : centsText(choice.priceCents),
		});
		if (lines.length === 1 && !order) setCurrency(choice.currency);
	}
	return (
		<div className="grid max-h-[65vh] gap-5 overflow-y-auto py-3 pr-1">
			<div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
				<div className="space-y-2">
					<Label>Client</Label>
					<NativeSelect
						name="clientId"
						defaultValue={order?.clientId ?? ""}
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
						value={currency}
						onChange={(event) => setCurrency(event.target.value)}
						minLength={3}
						maxLength={3}
						required
					/>
				</div>
			</div>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Order lines</Label>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setLines((current) => [...current, blankLine()])}
					>
						<Plus className="size-3.5" /> Add line
					</Button>
				</div>
				{lines.map((line, index) => {
					const custom = line.selection.startsWith("custom::");
					return (
						<div key={line.key} className="grid gap-3 rounded-lg border p-3">
							<div className="flex items-center justify-between">
								<span className="font-medium text-sm">Line {index + 1}</span>
								{lines.length > 1 && (
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										onClick={() =>
											setLines((current) =>
												current.filter((item) => item.key !== line.key),
											)
										}
									>
										<Trash className="size-4" />
									</Button>
								)}
							</div>
							<NativeSelect
								name="lineSelection"
								value={
									line.selection.startsWith("custom::")
										? "custom"
										: line.selection
								}
								onChange={(event) => select(line, event.target.value)}
								required
							>
								<option value="" disabled>
									Select an offering
								</option>
								{catalog.map((choice) => (
									<option key={choice.value} value={choice.value}>
										{choice.label}
									</option>
								))}
								<option value="custom">Custom line</option>
							</NativeSelect>
							<input type="hidden" name="lineName" value={line.name} />
							<input type="hidden" name="lineType" value={line.type} />
							<input type="hidden" name="lineSku" value={line.sku} />
							{custom && (
								<div className="grid gap-3 sm:grid-cols-3">
									<Input
										aria-label={`Line ${index + 1} name`}
										placeholder="Description"
										value={line.name}
										onChange={(event) =>
											update(line.key, { name: event.target.value })
										}
										required
									/>
									<NativeSelect
										value={line.type}
										onChange={(event) =>
											update(line.key, {
												type: event.target.value as EditableLine["type"],
											})
										}
									>
										{[
											"physical",
											"digital",
											"service",
											"package",
											"rental",
										].map((type) => (
											<option key={type} value={type}>
												{title(type)}
											</option>
										))}
									</NativeSelect>
									<Input
										placeholder="SKU (optional)"
										value={line.sku}
										onChange={(event) =>
											update(line.key, { sku: event.target.value })
										}
									/>
								</div>
							)}
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-2">
									<Label>Quantity</Label>
									<Input
										name="lineQuantity"
										type="number"
										min="1"
										step="1"
										value={line.quantity}
										onChange={(event) =>
											update(line.key, { quantity: event.target.value })
										}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label>Unit price</Label>
									<Input
										name="linePrice"
										inputMode="decimal"
										value={line.price}
										onChange={(event) =>
											update(line.key, { price: event.target.value })
										}
										required
									/>
								</div>
							</div>
						</div>
					);
				})}
			</div>
			<div className="space-y-2">
				<Label>Internal notes</Label>
				<Textarea name="notes" defaultValue={order?.notes ?? ""} />
			</div>
		</div>
	);
}

function OrderDialog({
	workspaceId,
	order,
	clients,
	catalog,
	defaultCurrency,
}: {
	workspaceId: string;
	order?: OrderViewModel;
	clients: OrderClientChoice[];
	catalog: OrderCatalogChoice[];
	defaultCurrency: string;
}) {
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(saveOrderAction, INITIAL);
	const router = useRouter();
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			router.refresh();
		}
	}, [state.completionId, router]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					size={order ? "sm" : "default"}
					variant={order ? "outline" : "default"}
				>
					{order ? (
						"Edit"
					) : (
						<>
							<Plus className="size-4" /> New order
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					{order && <input type="hidden" name="orderId" value={order.id} />}
					<DialogHeader>
						<DialogTitle>
							{order ? `Edit ${order.number}` : "Create an order draft"}
						</DialogTitle>
						<DialogDescription>
							Build an order from active catalog offerings or an honest custom
							line. Prices are snapshotted when saved.
						</DialogDescription>
					</DialogHeader>
					<OrderFields
						order={order}
						clients={clients}
						catalog={catalog}
						defaultCurrency={defaultCurrency}
					/>
					{state.error && (
						<p className="text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter className="mt-4">
						<Submit>{order ? "Save draft" : "Create draft"}</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function LifecycleForm({
	workspaceId,
	orderId,
	target,
	children,
	destructive = false,
}: {
	workspaceId: string;
	orderId: string;
	target?: string;
	children: React.ReactNode;
	destructive?: boolean;
}) {
	const action = target ? changeOrderStatusAction : deleteOrderAction;
	const [state, formAction] = useActionState(action, INITIAL);
	return (
		<form action={formAction} className="inline-flex flex-col gap-1">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="orderId" value={orderId} />
			{target && <input type="hidden" name="target" value={target} />}
			<Submit destructive={destructive}>{children}</Submit>
			{state.error && (
				<span className="max-w-56 text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}

function OrderDetails({
	workspaceId,
	order,
	clients,
	catalog,
	defaultCurrency,
}: {
	workspaceId: string;
	order: OrderViewModel;
	clients: OrderClientChoice[];
	catalog: OrderCatalogChoice[];
	defaultCurrency: string;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					Manage
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{order.number}</DialogTitle>
					<DialogDescription>
						Placed prices and item details remain historical snapshots even when
						the live catalog changes.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge>{title(order.status)}</Badge>
						<span className="text-muted-foreground text-sm">
							{order.clientName} · {money(order.totalCents, order.currency)}
						</span>
					</div>
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Item</TableHead>
									<TableHead>Qty</TableHead>
									<TableHead>Price</TableHead>
									<TableHead>Total</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{order.lines.map((line) => (
									<TableRow key={line.id}>
										<TableCell>
											<div className="font-medium">{line.name}</div>
											<div className="text-muted-foreground text-xs">
												{line.sku ?? title(line.type)}
											</div>
										</TableCell>
										<TableCell>{line.quantity}</TableCell>
										<TableCell>
											{money(line.unitPriceCents, order.currency)}
										</TableCell>
										<TableCell>
											{money(line.lineTotalCents, order.currency)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					{order.notes && (
						<p className="rounded-lg border p-3 text-sm">{order.notes}</p>
					)}
					<div className="flex flex-wrap gap-2">
						{order.status === "draft" && (
							<>
								<OrderDialog
									workspaceId={workspaceId}
									order={order}
									clients={clients}
									catalog={catalog}
									defaultCurrency={defaultCurrency}
								/>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="placed"
								>
									Place order
								</LifecycleForm>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									destructive
								>
									<Trash className="size-4" /> Delete draft
								</LifecycleForm>
							</>
						)}
						{order.status === "placed" && (
							<>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="confirmed"
								>
									Confirm and create fulfillment
								</LifecycleForm>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="cancelled"
								>
									Cancel
								</LifecycleForm>
							</>
						)}
						{order.status === "confirmed" && (
							<>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="processing"
								>
									Start processing
								</LifecycleForm>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="cancelled"
								>
									Cancel
								</LifecycleForm>
							</>
						)}
						{order.status === "processing" && (
							<>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="fulfilled"
								>
									Mark fulfilled
								</LifecycleForm>
								<LifecycleForm
									workspaceId={workspaceId}
									orderId={order.id}
									target="cancelled"
								>
									Cancel
								</LifecycleForm>
							</>
						)}
					</div>
					{order.fulfillmentId &&
						!["fulfilled", "cancelled"].includes(order.status) && (
							<p className="text-muted-foreground text-sm">
								Delivery is tracked in{" "}
								<Link
									className="underline"
									href={`/${workspaceId}/fulfillment`}
								>
									Fulfillment
								</Link>
								. Complete it there before completing the order.
							</p>
						)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function OrdersView({
	workspaceId,
	orders,
	clients,
	catalog,
	defaultCurrency,
}: {
	workspaceId: string;
	orders: OrderViewModel[];
	clients: OrderClientChoice[];
	catalog: OrderCatalogChoice[];
	defaultCurrency: string;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			orders.filter(
				(order) =>
					(status === "all" || order.status === status) &&
					[
						order.number,
						order.clientName,
						order.clientEmail,
						...order.lines.map((line) => line.name),
					].some((value) => value?.toLowerCase().includes(query.toLowerCase())),
			),
		[orders, query, status],
	);
	const canCreate = clients.length > 0;
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg">Orders</h2>
					<p className="text-muted-foreground text-sm">
						Track client purchases from draft through confirmed delivery.
					</p>
				</div>
				{canCreate && (
					<OrderDialog
						workspaceId={workspaceId}
						clients={clients}
						catalog={catalog}
						defaultCurrency={defaultCurrency}
					/>
				)}
			</div>
			{!canCreate ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Package />
						</EmptyMedia>
						<EmptyTitle>Add a client first</EmptyTitle>
						<EmptyDescription>
							Every order needs a client record so its buyer identity can be
							preserved.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild>
							<Link href={`/${workspaceId}/client-records`}>
								Open Client Records
							</Link>
						</Button>
					</EmptyContent>
				</Empty>
			) : orders.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Package />
						</EmptyMedia>
						<EmptyTitle>No orders yet</EmptyTitle>
						<EmptyDescription>
							Create a draft from the catalog or add a custom order line.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<OrderDialog
							workspaceId={workspaceId}
							clients={clients}
							catalog={catalog}
							defaultCurrency={defaultCurrency}
						/>
					</EmptyContent>
				</Empty>
			) : (
				<>
					<div className="flex gap-3">
						<div className="relative flex-1">
							<MagnifyingGlass className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
							<Input
								className="pl-9"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search order, client, or item…"
							/>
						</div>
						<NativeSelect
							className="w-40"
							value={status}
							onChange={(event) => setStatus(event.target.value)}
						>
							<option value="all">All statuses</option>
							{[
								"draft",
								"placed",
								"confirmed",
								"processing",
								"fulfilled",
								"cancelled",
							].map((value) => (
								<option key={value} value={value}>
									{title(value)}
								</option>
							))}
						</NativeSelect>
					</div>
					{filtered.length === 0 ? (
						<div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
							No orders match those filters.
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Order</TableHead>
										<TableHead>Client</TableHead>
										<TableHead>Items</TableHead>
										<TableHead>Total</TableHead>
										<TableHead>Status</TableHead>
										<TableHead />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filtered.map((order) => (
										<TableRow key={order.id}>
											<TableCell>
												<div className="font-medium">{order.number}</div>
												<div className="text-muted-foreground text-xs">
													{new Date(order.createdAt).toLocaleDateString()}
												</div>
											</TableCell>
											<TableCell>{order.clientName}</TableCell>
											<TableCell>
												{order.lines.reduce(
													(sum, line) => sum + line.quantity,
													0,
												)}
											</TableCell>
											<TableCell>
												{money(order.totalCents, order.currency)}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														order.status === "cancelled"
															? "secondary"
															: "default"
													}
												>
													{title(order.status)}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<OrderDetails
													workspaceId={workspaceId}
													order={order}
													clients={clients}
													catalog={catalog}
													defaultCurrency={defaultCurrency}
												/>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</>
			)}
		</section>
	);
}
