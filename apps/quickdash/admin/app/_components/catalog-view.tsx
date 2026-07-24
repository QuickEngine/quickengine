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
import { formatMoney } from "@quickengine/ui/lib/format";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type CatalogActionState,
	changeCatalogItemStatusAction,
	changeVariantStatusAction,
	deleteCatalogItemAction,
	deleteVariantAction,
	saveCatalogItemAction,
	saveVariantAction,
} from "../_lib/catalog-actions";

export type CatalogVariantViewModel = {
	id: string;
	options: Array<{ name: string; value: string }>;
	status: "draft" | "active" | "archived";
	sku: string | null;
	priceCentsOverride: number | null;
};
export type CatalogItemViewModel = {
	id: string;
	name: string;
	description: string | null;
	type: "physical" | "digital" | "service" | "package" | "rental";
	status: "draft" | "active" | "archived";
	sku: string | null;
	pricingModel: "fixed" | "starting_at" | "hourly" | "custom_quote" | "free";
	priceCents: number | null;
	currency: string;
	unitLabel: string | null;
	variants: CatalogVariantViewModel[];
};
const INITIAL: CatalogActionState = { error: null, completionId: null };
const centsText = (value: number | null) =>
	value === null
		? ""
		: `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
const money = formatMoney;
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

function ItemFields({
	item,
	defaultCurrency,
}: {
	item?: CatalogItemViewModel;
	defaultCurrency: string;
}) {
	const [pricing, setPricing] = useState(item?.pricingModel ?? "fixed");
	return (
		<div className="grid max-h-[65vh] gap-4 overflow-y-auto py-2 pr-1">
			<div className="space-y-2">
				<Label>Name</Label>
				<Input name="name" defaultValue={item?.name} required />
			</div>
			<div className="space-y-2">
				<Label>Description</Label>
				<Textarea name="description" defaultValue={item?.description ?? ""} />
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Type</Label>
					<NativeSelect name="type" defaultValue={item?.type ?? "physical"}>
						{["physical", "digital", "service", "package", "rental"].map(
							(type) => (
								<option key={type} value={type}>
									{title(type)}
								</option>
							),
						)}
					</NativeSelect>
				</div>
				<div className="space-y-2">
					<Label>SKU (optional)</Label>
					<Input name="sku" defaultValue={item?.sku ?? ""} />
				</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Pricing</Label>
					<NativeSelect
						name="pricingModel"
						value={pricing}
						onChange={(event) =>
							setPricing(event.target.value as typeof pricing)
						}
					>
						{["fixed", "starting_at", "hourly", "custom_quote", "free"].map(
							(model) => (
								<option key={model} value={model}>
									{title(model)}
								</option>
							),
						)}
					</NativeSelect>
				</div>
				<div className="space-y-2">
					<Label>Price</Label>
					<Input
						name="price"
						inputMode="decimal"
						defaultValue={centsText(item?.priceCents ?? null)}
						disabled={["custom_quote", "free"].includes(pricing)}
						required={!["custom_quote", "free"].includes(pricing)}
					/>
				</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Currency</Label>
					<Input
						name="currency"
						defaultValue={item?.currency ?? defaultCurrency}
						minLength={3}
						maxLength={3}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label>Unit label (optional)</Label>
					<Input
						name="unitLabel"
						defaultValue={item?.unitLabel ?? ""}
						placeholder="item, hour, session…"
					/>
				</div>
			</div>
		</div>
	);
}

function ItemDialog({
	workspaceId,
	defaultCurrency,
	item,
}: {
	workspaceId: string;
	defaultCurrency: string;
	item?: CatalogItemViewModel;
}) {
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(saveCatalogItemAction, INITIAL);
	const router = useRouter();
	// A per-submit idempotency key so a double-fire creates only one item; a fresh key is
	// minted after each success. Sent only when creating — an update is naturally idempotent.
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			setIdempotencyKey(crypto.randomUUID());
			router.refresh();
		}
	}, [state.completionId, router]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={item ? "outline" : "default"}
					size={item ? "sm" : "default"}
				>
					{item ? (
						"Edit"
					) : (
						<>
							<Plus className="size-4" /> Add item
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					{item ? (
						<input type="hidden" name="itemId" value={item.id} />
					) : (
						<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					)}
					<DialogHeader>
						<DialogTitle>
							{item ? "Edit catalog item" : "Add a product or service"}
						</DialogTitle>
						<DialogDescription>
							Define what this workspace sells, delivers, books, or rents.
						</DialogDescription>
					</DialogHeader>
					<ItemFields item={item} defaultCurrency={defaultCurrency} />
					{state.error && (
						<p className="text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter className="mt-4">
						<Submit>{item ? "Save changes" : "Create draft"}</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function StatusForm({
	workspaceId,
	name,
	id,
	target,
	action,
	children,
	destructive = false,
}: {
	workspaceId: string;
	name: "itemId" | "variantId";
	id: string;
	target?: string;
	action: typeof changeCatalogItemStatusAction;
	children: React.ReactNode;
	destructive?: boolean;
}) {
	const [state, formAction] = useActionState(action, INITIAL);
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	useEffect(() => {
		if (state.completionId) setIdempotencyKey(crypto.randomUUID());
	}, [state.completionId]);
	return (
		<form action={formAction} className="inline-flex flex-col gap-1">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name={name} value={id} />
			<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
			{target && <input type="hidden" name="target" value={target} />}
			<Submit destructive={destructive}>{children}</Submit>
			{state.error && (
				<span className="max-w-52 text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}

function VariantDialog({
	workspaceId,
	item,
	variant,
}: {
	workspaceId: string;
	item: CatalogItemViewModel;
	variant?: CatalogVariantViewModel;
}) {
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(saveVariantAction, INITIAL);
	const router = useRouter();
	// A per-submit idempotency key so a double-fire creates only one variant; a fresh key is
	// minted after each success. Sent only when creating — an update is naturally idempotent.
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			setIdempotencyKey(crypto.randomUUID());
			router.refresh();
		}
	}, [state.completionId, router]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{variant ? (
						"Edit"
					) : (
						<>
							<Plus className="size-3.5" /> Variant
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="itemId" value={item.id} />
					{variant ? (
						<input type="hidden" name="variantId" value={variant.id} />
					) : (
						<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					)}
					<DialogHeader>
						<DialogTitle>
							{variant ? "Edit variant" : `Add a ${item.name} variant`}
						</DialogTitle>
						<DialogDescription>
							Use comma-separated Name: Value pairs, such as Size: Large, Color:
							Blue.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label>Options</Label>
							<Input
								name="options"
								defaultValue={variant?.options
									.map((option) => `${option.name}: ${option.value}`)
									.join(", ")}
								placeholder="Size: Large, Color: Blue"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>SKU (optional)</Label>
							<Input name="sku" defaultValue={variant?.sku ?? ""} />
						</div>
						<div className="space-y-2">
							<Label>Price override (optional)</Label>
							<Input
								name="priceOverride"
								inputMode="decimal"
								defaultValue={centsText(variant?.priceCentsOverride ?? null)}
								placeholder="Inherits the parent price"
							/>
						</div>
					</div>
					{state.error && (
						<p className="text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter>
						<Submit>{variant ? "Save variant" : "Create variant"}</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ItemDetails({
	workspaceId,
	item,
	defaultCurrency,
}: {
	workspaceId: string;
	item: CatalogItemViewModel;
	defaultCurrency: string;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					Manage
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{item.name}</DialogTitle>
					<DialogDescription>
						Manage the catalog record, lifecycle, and concrete variants.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-wrap gap-2">
					<ItemDialog
						workspaceId={workspaceId}
						item={item}
						defaultCurrency={defaultCurrency}
					/>
					{item.status === "draft" && (
						<StatusForm
							workspaceId={workspaceId}
							name="itemId"
							id={item.id}
							target="active"
							action={changeCatalogItemStatusAction}
						>
							Activate
						</StatusForm>
					)}
					{item.status === "active" && (
						<StatusForm
							workspaceId={workspaceId}
							name="itemId"
							id={item.id}
							target="draft"
							action={changeCatalogItemStatusAction}
						>
							Return to draft
						</StatusForm>
					)}
					{item.status !== "archived" && (
						<StatusForm
							workspaceId={workspaceId}
							name="itemId"
							id={item.id}
							target="archived"
							action={changeCatalogItemStatusAction}
						>
							Archive
						</StatusForm>
					)}
					{item.status === "archived" && (
						<>
							<StatusForm
								workspaceId={workspaceId}
								name="itemId"
								id={item.id}
								target="draft"
								action={changeCatalogItemStatusAction}
							>
								Restore as draft
							</StatusForm>
							<StatusForm
								workspaceId={workspaceId}
								name="itemId"
								id={item.id}
								action={deleteCatalogItemAction}
								destructive
							>
								<Trash className="size-4" /> Delete permanently
							</StatusForm>
						</>
					)}
				</div>
				<div className="mt-2 flex items-center justify-between">
					<h3 className="font-medium">Variants</h3>
					{item.status !== "archived" && (
						<VariantDialog workspaceId={workspaceId} item={item} />
					)}
				</div>
				{item.variants.length === 0 ? (
					<p className="rounded-lg border border-dashed p-5 text-muted-foreground text-sm">
						No variants. A simple product or service does not need them.
					</p>
				) : (
					<div className="max-h-80 space-y-2 overflow-y-auto">
						{item.variants.map((variant) => (
							<div
								key={variant.id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
							>
								<div>
									<div className="font-medium text-sm">
										{variant.options
											.map((option) => `${option.name}: ${option.value}`)
											.join(" / ")}
									</div>
									<div className="text-muted-foreground text-xs">
										{variant.sku ?? "No SKU"} ·{" "}
										{variant.priceCentsOverride === null
											? "Inherits price"
											: money(variant.priceCentsOverride, item.currency)}{" "}
										· {variant.status}
									</div>
								</div>
								<div className="flex flex-wrap gap-2">
									<VariantDialog
										workspaceId={workspaceId}
										item={item}
										variant={variant}
									/>
									{variant.status === "draft" && (
										<StatusForm
											workspaceId={workspaceId}
											name="variantId"
											id={variant.id}
											target="active"
											action={changeVariantStatusAction}
										>
											Activate
										</StatusForm>
									)}
									{variant.status === "active" && (
										<StatusForm
											workspaceId={workspaceId}
											name="variantId"
											id={variant.id}
											target="draft"
											action={changeVariantStatusAction}
										>
											Draft
										</StatusForm>
									)}
									{variant.status !== "archived" && (
										<StatusForm
											workspaceId={workspaceId}
											name="variantId"
											id={variant.id}
											target="archived"
											action={changeVariantStatusAction}
										>
											Archive
										</StatusForm>
									)}
									{variant.status === "archived" && (
										<>
											<StatusForm
												workspaceId={workspaceId}
												name="variantId"
												id={variant.id}
												target="draft"
												action={changeVariantStatusAction}
											>
												Restore
											</StatusForm>
											<StatusForm
												workspaceId={workspaceId}
												name="variantId"
												id={variant.id}
												action={deleteVariantAction}
												destructive
											>
												Delete
											</StatusForm>
										</>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function CatalogView({
	workspaceId,
	items,
	defaultCurrency,
	productLabel,
	serviceLabel,
}: {
	workspaceId: string;
	items: CatalogItemViewModel[];
	defaultCurrency: string;
	productLabel: string;
	serviceLabel: string;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			items.filter(
				(item) =>
					(status === "all" || item.status === status) &&
					[item.name, item.sku, item.description, item.type].some((value) =>
						value?.toLowerCase().includes(query.toLowerCase()),
					),
			),
		[items, query, status],
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg">Catalog</h2>
					<p className="text-muted-foreground text-sm">
						Manage {productLabel.toLowerCase()}, {serviceLabel.toLowerCase()},
						packages, digital goods, and rentals.
					</p>
				</div>
				<ItemDialog
					workspaceId={workspaceId}
					defaultCurrency={defaultCurrency}
				/>
			</div>
			{items.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Package />
						</EmptyMedia>
						<EmptyTitle>Your catalog is empty</EmptyTitle>
						<EmptyDescription>
							Add the first thing this business sells or provides.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<ItemDialog
							workspaceId={workspaceId}
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
								placeholder="Search name, SKU, type…"
							/>
						</div>
						<NativeSelect
							className="w-36"
							value={status}
							onChange={(event) => setStatus(event.target.value)}
						>
							<option value="all">All statuses</option>
							<option value="draft">Draft</option>
							<option value="active">Active</option>
							<option value="archived">Archived</option>
						</NativeSelect>
					</div>
					{filtered.length === 0 ? (
						<div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
							No catalog items match those filters.
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Price</TableHead>
										<TableHead>Variants</TableHead>
										<TableHead>Status</TableHead>
										<TableHead />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filtered.map((item) => (
										<TableRow key={item.id}>
											<TableCell>
												<div className="font-medium">{item.name}</div>
												<div className="text-muted-foreground text-xs">
													{item.sku ?? "No SKU"}
												</div>
											</TableCell>
											<TableCell>{title(item.type)}</TableCell>
											<TableCell>
												{item.priceCents === null
													? title(item.pricingModel)
													: `${item.pricingModel === "starting_at" ? "From " : ""}${money(item.priceCents, item.currency)}${item.pricingModel === "hourly" ? "/hour" : ""}`}
											</TableCell>
											<TableCell>{item.variants.length}</TableCell>
											<TableCell>
												<Badge
													variant={
														item.status === "active" ? "default" : "secondary"
													}
												>
													{item.status === "archived" && (
														<Archive className="size-3" />
													)}
													{title(item.status)}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<ItemDetails
													workspaceId={workspaceId}
													item={item}
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
