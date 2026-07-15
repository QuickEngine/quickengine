"use client";

import {
	Archive,
	MagnifyingGlass,
	Package,
	Plus,
	Trash,
} from "@phosphor-icons/react";
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
	adjustInventoryAction,
	changeInventoryStatusAction,
	createInventoryItemAction,
	deleteInventoryItemAction,
	type InventoryActionState,
	updateInventoryItemAction,
} from "../_lib/inventory-actions";

export type InventoryMovementViewModel = {
	id: string;
	kind: string;
	quantity: number;
	onHandDelta: number;
	reservedDelta: number;
	resultingOnHand: number;
	resultingReserved: number;
	note: string | null;
	createdAt: string;
};
export type InventoryItemViewModel = {
	id: string;
	catalogItemId: string;
	catalogItemVariantId: string | null;
	label: string;
	sku: string | null;
	status: "active" | "archived";
	onHand: number;
	reserved: number;
	available: number;
	lowStockThreshold: number;
	movements: InventoryMovementViewModel[];
};
export type InventoryTargetChoice = {
	value: string;
	label: string;
	sku: string | null;
};
const INITIAL: InventoryActionState = { error: null, completionId: null };
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

function CreateDialog({
	workspaceId,
	targets,
	defaultThreshold,
}: {
	workspaceId: string;
	targets: InventoryTargetChoice[];
	defaultThreshold: number;
}) {
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(createInventoryItemAction, INITIAL);
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
				<Button>
					<Plus className="size-4" /> Track inventory
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<DialogHeader>
						<DialogTitle>Track catalog inventory</DialogTitle>
						<DialogDescription>
							Create one stock record for a base item or concrete variant.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label>Catalog target</Label>
							<NativeSelect name="target" defaultValue="" required>
								<option value="" disabled>
									Select an item or variant
								</option>
								{targets.map((target) => (
									<option key={target.value} value={target.value}>
										{target.label}
										{target.sku ? ` — ${target.sku}` : ""}
									</option>
								))}
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label>Low-stock threshold</Label>
							<Input
								name="lowStockThreshold"
								type="number"
								min="0"
								step="1"
								defaultValue={defaultThreshold}
								required
							/>
						</div>
					</div>
					{state.error && (
						<p className="text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter>
						<Submit>Create inventory record</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AdjustmentDialog({
	workspaceId,
	item,
}: {
	workspaceId: string;
	item: InventoryItemViewModel;
}) {
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(adjustInventoryAction, INITIAL);
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
				<Button size="sm">Adjust stock</Button>
			</DialogTrigger>
			<DialogContent>
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="inventoryItemId" value={item.id} />
					<DialogHeader>
						<DialogTitle>Record stock movement</DialogTitle>
						<DialogDescription>
							Movements are append-only audit history. Choose what actually
							happened.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label>Movement</Label>
							<NativeSelect name="kind" required>
								{[
									"receive",
									"sale",
									"customer_return",
									"damage",
									"correction_in",
									"correction_out",
									"reserve",
									"release",
									"fulfill_reserved",
								].map((kind) => (
									<option key={kind} value={kind}>
										{title(kind)}
									</option>
								))}
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label>Quantity</Label>
							<Input name="quantity" type="number" min="1" step="1" required />
						</div>
						<div className="space-y-2">
							<Label>Reason or note</Label>
							<Textarea name="note" maxLength={1000} />
						</div>
					</div>
					{state.error && (
						<p className="text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter>
						<Submit>Record movement</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ActionForm({
	workspaceId,
	itemId,
	target,
	action,
	children,
	destructive = false,
}: {
	workspaceId: string;
	itemId: string;
	target?: string;
	action: typeof changeInventoryStatusAction;
	children: React.ReactNode;
	destructive?: boolean;
}) {
	const [state, formAction] = useActionState(action, INITIAL);
	return (
		<form action={formAction} className="inline-flex flex-col gap-1">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="inventoryItemId" value={itemId} />
			{target && <input type="hidden" name="target" value={target} />}
			<Submit destructive={destructive}>{children}</Submit>
			{state.error && (
				<span className="max-w-56 text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}

function Details({
	workspaceId,
	item,
}: {
	workspaceId: string;
	item: InventoryItemViewModel;
}) {
	const [thresholdState, thresholdAction] = useActionState(
		updateInventoryItemAction,
		INITIAL,
	);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					Manage
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{item.label}</DialogTitle>
					<DialogDescription>
						On hand is physical stock. Reserved is promised stock. Available is
						on hand minus reserved.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="grid grid-cols-3 gap-3">
						{[
							["On hand", item.onHand],
							["Reserved", item.reserved],
							["Available", item.available],
						].map(([label, value]) => (
							<div key={label} className="rounded-lg border p-3">
								<div className="text-muted-foreground text-xs">{label}</div>
								<div className="font-semibold text-xl">{value}</div>
							</div>
						))}
					</div>
					<div className="flex flex-wrap gap-2">
						{item.status === "active" ? (
							<>
								<AdjustmentDialog workspaceId={workspaceId} item={item} />
								<ActionForm
									workspaceId={workspaceId}
									itemId={item.id}
									target="archived"
									action={changeInventoryStatusAction}
								>
									<Archive className="size-4" /> Archive
								</ActionForm>
							</>
						) : (
							<>
								<ActionForm
									workspaceId={workspaceId}
									itemId={item.id}
									target="active"
									action={changeInventoryStatusAction}
								>
									Restore
								</ActionForm>
								<ActionForm
									workspaceId={workspaceId}
									itemId={item.id}
									action={deleteInventoryItemAction}
									destructive
								>
									<Trash className="size-4" /> Delete permanently
								</ActionForm>
							</>
						)}
					</div>
					<form action={thresholdAction} className="flex items-end gap-3">
						<input type="hidden" name="workspaceId" value={workspaceId} />
						<input type="hidden" name="inventoryItemId" value={item.id} />
						<div className="space-y-2">
							<Label>Low-stock threshold</Label>
							<Input
								name="lowStockThreshold"
								type="number"
								min="0"
								step="1"
								defaultValue={item.lowStockThreshold}
								required
							/>
						</div>
						<Submit>Update threshold</Submit>
						{thresholdState.error && (
							<p className="text-destructive text-xs">{thresholdState.error}</p>
						)}
					</form>
					<div>
						<h3 className="mb-2 font-medium">Movement history</h3>
						{item.movements.length === 0 ? (
							<p className="rounded-lg border border-dashed p-5 text-muted-foreground text-sm">
								No stock movements yet.
							</p>
						) : (
							<div className="max-h-72 overflow-y-auto rounded-lg border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Movement</TableHead>
											<TableHead>Qty</TableHead>
											<TableHead>On hand</TableHead>
											<TableHead>Reserved</TableHead>
											<TableHead>Date</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{item.movements.map((movement) => (
											<TableRow key={movement.id}>
												<TableCell>
													<div>{title(movement.kind)}</div>
													{movement.note && (
														<div className="text-muted-foreground text-xs">
															{movement.note}
														</div>
													)}
												</TableCell>
												<TableCell>{movement.quantity}</TableCell>
												<TableCell>{movement.resultingOnHand}</TableCell>
												<TableCell>{movement.resultingReserved}</TableCell>
												<TableCell>
													{new Date(movement.createdAt).toLocaleDateString()}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function InventoryView({
	workspaceId,
	items,
	targets,
	defaultThreshold,
}: {
	workspaceId: string;
	items: InventoryItemViewModel[];
	targets: InventoryTargetChoice[];
	defaultThreshold: number;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			items.filter(
				(item) =>
					(status === "all" || item.status === status) &&
					[item.label, item.sku].some((value) =>
						value?.toLowerCase().includes(query.toLowerCase()),
					),
			),
		[items, query, status],
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg">Inventory</h2>
					<p className="text-muted-foreground text-sm">
						Track physical stock, reservations, availability, and an auditable
						movement ledger.
					</p>
				</div>
				{targets.length > 0 && (
					<CreateDialog
						workspaceId={workspaceId}
						targets={targets}
						defaultThreshold={defaultThreshold}
					/>
				)}
			</div>
			{items.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Package />
						</EmptyMedia>
						<EmptyTitle>No inventory records</EmptyTitle>
						<EmptyDescription>
							{targets.length > 0
								? "Choose a catalog product or variant to begin tracking stock."
								: "Create an active product or variant before tracking inventory."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{targets.length > 0 ? (
							<CreateDialog
								workspaceId={workspaceId}
								targets={targets}
								defaultThreshold={defaultThreshold}
							/>
						) : (
							<Button asChild>
								<Link href={`/${workspaceId}/products-services`}>
									Open Products & Services
								</Link>
							</Button>
						)}
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
								placeholder="Search item, variant, or SKU…"
							/>
						</div>
						<NativeSelect
							className="w-36"
							value={status}
							onChange={(event) => setStatus(event.target.value)}
						>
							<option value="all">All statuses</option>
							<option value="active">Active</option>
							<option value="archived">Archived</option>
						</NativeSelect>
					</div>
					{filtered.length === 0 ? (
						<div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
							No inventory records match those filters.
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Catalog target</TableHead>
										<TableHead>On hand</TableHead>
										<TableHead>Reserved</TableHead>
										<TableHead>Available</TableHead>
										<TableHead>Status</TableHead>
										<TableHead />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filtered.map((item) => (
										<TableRow key={item.id}>
											<TableCell>
												<div className="font-medium">{item.label}</div>
												<div className="text-muted-foreground text-xs">
													{item.sku ?? "No SKU"}
												</div>
											</TableCell>
											<TableCell>{item.onHand}</TableCell>
											<TableCell>{item.reserved}</TableCell>
											<TableCell>
												<span
													className={
														item.available <= item.lowStockThreshold
															? "text-destructive"
															: ""
													}
												>
													{item.available}
												</span>
												<div className="text-muted-foreground text-xs">
													Low at ≤ {item.lowStockThreshold}
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														item.status === "active" ? "default" : "secondary"
													}
												>
													{title(item.status)}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<Details workspaceId={workspaceId} item={item} />
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
