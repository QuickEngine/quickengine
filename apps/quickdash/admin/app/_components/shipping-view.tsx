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
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	changeShipmentStatusAction,
	createShipmentAction,
	deleteShipmentAction,
	type ShippingActionState,
	updateShipmentTrackingAction,
} from "../_lib/shipping-actions";

type Status =
	| "draft"
	| "ready"
	| "shipped"
	| "in_transit"
	| "delivered"
	| "exception"
	| "cancelled";
export type ShippableLine = {
	orderId: string;
	orderNumber: string;
	lineId: string;
	label: string;
	remaining: number;
	recipientName: string;
	recipientEmail: string | null;
};
export type ShipmentViewModel = {
	id: string;
	orderNumber: string;
	status: Status;
	destination: {
		recipientName: string;
		company: string | null;
		line1: string;
		line2: string | null;
		city: string;
		region: string | null;
		postalCode: string | null;
		countryCode: string;
	};
	carrier: string | null;
	serviceLevel: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	lines: Array<{ label: string; quantity: number }>;
	parcels: Array<{ weightGrams: number }>;
	createdAt: string;
};

const INITIAL: ShippingActionState = { error: null, completionId: null };
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
	lines,
	defaultCountry,
	defaultCarrier,
}: {
	workspaceId: string;
	lines: ShippableLine[];
	defaultCountry: string;
	defaultCarrier: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState(lines[0]?.lineId ?? "");
	const [state, action] = useActionState(createShipmentAction, INITIAL);
	const router = useRouter();
	const line = lines.find((item) => item.lineId === selected);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			router.refresh();
		}
	}, [state.completionId, router]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button disabled={lines.length === 0}>
					<Plus className="size-4" /> Create shipment
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="orderId" value={line?.orderId ?? ""} />
					<DialogHeader>
						<DialogTitle>Create shipment</DialogTitle>
						<DialogDescription>
							Allocate one physical order line to a parcel. Create more
							shipments for split delivery.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4 md:grid-cols-2">
						<div className="space-y-2 md:col-span-2">
							<Label>Order line</Label>
							<NativeSelect
								name="orderLineItemId"
								value={selected}
								onChange={(event) => setSelected(event.target.value)}
								required
							>
								{lines.map((item) => (
									<option key={item.lineId} value={item.lineId}>
										{item.orderNumber} — {item.label} ({item.remaining}{" "}
										remaining)
									</option>
								))}
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label>Quantity</Label>
							<Input
								name="quantity"
								type="number"
								min="1"
								max={line?.remaining ?? 1}
								step="1"
								defaultValue="1"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Parcel weight (grams)</Label>
							<Input
								name="weightGrams"
								type="number"
								min="1"
								step="1"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Recipient</Label>
							<Input
								name="recipientName"
								defaultValue={line?.recipientName ?? ""}
								maxLength={160}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Company</Label>
							<Input name="company" maxLength={160} />
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label>Address line 1</Label>
							<Input name="line1" maxLength={200} required />
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label>Address line 2</Label>
							<Input name="line2" maxLength={200} />
						</div>
						<div className="space-y-2">
							<Label>City</Label>
							<Input name="city" maxLength={120} required />
						</div>
						<div className="space-y-2">
							<Label>State / region</Label>
							<Input name="region" maxLength={120} />
						</div>
						<div className="space-y-2">
							<Label>Postal code</Label>
							<Input name="postalCode" maxLength={32} required />
						</div>
						<div className="space-y-2">
							<Label>Country code</Label>
							<Input
								name="countryCode"
								defaultValue={defaultCountry}
								minLength={2}
								maxLength={2}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Email</Label>
							<Input
								name="email"
								type="email"
								defaultValue={line?.recipientEmail ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label>Phone</Label>
							<Input name="phone" maxLength={40} />
						</div>
						<div className="space-y-2">
							<Label>Carrier</Label>
							<Input
								name="carrier"
								defaultValue={defaultCarrier ?? ""}
								maxLength={80}
							/>
						</div>
						<div className="space-y-2">
							<Label>Service</Label>
							<Input name="serviceLevel" maxLength={120} />
						</div>
						<div className="space-y-2">
							<Label>Tracking number</Label>
							<Input name="trackingNumber" maxLength={200} />
						</div>
						<div className="space-y-2">
							<Label>Tracking URL</Label>
							<Input name="trackingUrl" type="url" />
						</div>
						<div className="space-y-2">
							<Label>Length (mm, optional)</Label>
							<Input name="lengthMillimeters" type="number" min="1" />
						</div>
						<div className="space-y-2">
							<Label>Width (mm, optional)</Label>
							<Input name="widthMillimeters" type="number" min="1" />
						</div>
						<div className="space-y-2">
							<Label>Height (mm, optional)</Label>
							<Input name="heightMillimeters" type="number" min="1" />
						</div>
					</div>
					<p className="mb-3 text-muted-foreground text-xs">
						Dimensions are optional, but if used, all three are required. This
						records shipment data; it does not buy a label.
					</p>
					{state.error && (
						<p className="mb-3 text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter>
						<Submit>Create draft</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const transitions: Record<Status, Status[]> = {
	draft: ["ready", "cancelled"],
	ready: ["draft", "shipped", "cancelled"],
	shipped: ["in_transit", "delivered", "exception"],
	in_transit: ["delivered", "exception"],
	delivered: [],
	exception: ["in_transit", "delivered", "cancelled"],
	cancelled: [],
};

function Details({
	workspaceId,
	shipment,
}: {
	workspaceId: string;
	shipment: ShipmentViewModel;
}) {
	const [trackingState, trackingAction] = useActionState(
		updateShipmentTrackingAction,
		INITIAL,
	);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					Manage
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Shipment for {shipment.orderNumber}</DialogTitle>
					<DialogDescription>
						{shipment.destination.recipientName} · {shipment.destination.line1},{" "}
						{shipment.destination.city}, {shipment.destination.countryCode}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="rounded-lg border p-3 text-sm">
						{shipment.lines.map((line) => (
							<div key={line.label}>
								{line.quantity} × {line.label}
							</div>
						))}
						<div className="mt-2 text-muted-foreground">
							{shipment.parcels.length} parcel ·{" "}
							{shipment.parcels.reduce(
								(sum, parcel) => sum + parcel.weightGrams,
								0,
							)}{" "}
							g total
						</div>
					</div>
					<form action={trackingAction} className="grid gap-3 md:grid-cols-2">
						<input type="hidden" name="workspaceId" value={workspaceId} />
						<input type="hidden" name="shipmentId" value={shipment.id} />
						<div className="space-y-2">
							<Label>Carrier</Label>
							<Input name="carrier" defaultValue={shipment.carrier ?? ""} />
						</div>
						<div className="space-y-2">
							<Label>Service</Label>
							<Input
								name="serviceLevel"
								defaultValue={shipment.serviceLevel ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label>Tracking number</Label>
							<Input
								name="trackingNumber"
								defaultValue={shipment.trackingNumber ?? ""}
							/>
						</div>
						<div className="space-y-2">
							<Label>Tracking URL</Label>
							<Input
								name="trackingUrl"
								type="url"
								defaultValue={shipment.trackingUrl ?? ""}
							/>
						</div>
						<div className="md:col-span-2">
							<Submit>Update tracking</Submit>
							{trackingState.error && (
								<p className="mt-2 text-destructive text-xs">
									{trackingState.error}
								</p>
							)}
						</div>
					</form>
					<div className="flex flex-wrap gap-2">
						{transitions[shipment.status].map((target) => (
							<StatusForm
								key={target}
								workspaceId={workspaceId}
								shipmentId={shipment.id}
								target={target}
							/>
						))}
						{(["draft", "cancelled"] as Status[]).includes(shipment.status) && (
							<StatusForm
								workspaceId={workspaceId}
								shipmentId={shipment.id}
								action="delete"
							/>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function StatusForm({
	workspaceId,
	shipmentId,
	target,
	action = "status",
}: {
	workspaceId: string;
	shipmentId: string;
	target?: Status;
	action?: "status" | "delete";
}) {
	const [state, formAction] = useActionState(
		action === "delete" ? deleteShipmentAction : changeShipmentStatusAction,
		INITIAL,
	);
	return (
		<form action={formAction} className="inline-flex flex-col gap-1">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="shipmentId" value={shipmentId} />
			{target && <input type="hidden" name="target" value={target} />}
			<Submit destructive={action === "delete" || target === "cancelled"}>
				{action === "delete" ? (
					<>
						<Trash className="size-4" /> Delete
					</>
				) : (
					title(target ?? "")
				)}
			</Submit>
			{state.error && (
				<span className="max-w-56 text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}

export function ShippingView({
	workspaceId,
	shipments,
	shippableLines,
	defaultCountry,
	defaultCarrier,
}: {
	workspaceId: string;
	shipments: ShipmentViewModel[];
	shippableLines: ShippableLine[];
	defaultCountry: string;
	defaultCarrier: string | null;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			shipments.filter(
				(shipment) =>
					(status === "all" || shipment.status === status) &&
					`${shipment.orderNumber} ${shipment.destination.recipientName} ${shipment.trackingNumber ?? ""}`
						.toLowerCase()
						.includes(query.toLowerCase()),
			),
		[shipments, query, status],
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-medium text-lg">Shipment desk</h2>
					<p className="text-muted-foreground text-sm">
						Allocate physical order lines and track each delivery.
					</p>
				</div>
				<CreateDialog
					workspaceId={workspaceId}
					lines={shippableLines}
					defaultCountry={defaultCountry}
					defaultCarrier={defaultCarrier}
				/>
			</div>
			<div className="flex gap-2">
				<div className="relative flex-1">
					<MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search order, recipient, or tracking"
					/>
				</div>
				<NativeSelect
					className="w-44"
					value={status}
					onChange={(event) => setStatus(event.target.value)}
				>
					<option value="all">All statuses</option>
					{Object.keys(transitions).map((value) => (
						<option key={value} value={value}>
							{title(value)}
						</option>
					))}
				</NativeSelect>
			</div>
			{filtered.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Package />
						</EmptyMedia>
						<EmptyTitle>
							{shipments.length === 0
								? "No shipments yet"
								: "No matching shipments"}
						</EmptyTitle>
						<EmptyDescription>
							{shippableLines.length === 0
								? "Confirm an order containing physical or rental items before creating a shipment."
								: "Create a shipment from an available order line."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent />
				</Empty>
			) : (
				<div className="rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Order</TableHead>
								<TableHead>Recipient</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Tracking</TableHead>
								<TableHead>Created</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((shipment) => (
								<TableRow key={shipment.id}>
									<TableCell className="font-medium">
										{shipment.orderNumber}
									</TableCell>
									<TableCell>{shipment.destination.recipientName}</TableCell>
									<TableCell>
										<Badge variant="secondary">{title(shipment.status)}</Badge>
									</TableCell>
									<TableCell>
										{shipment.trackingNumber ?? "Not added"}
									</TableCell>
									<TableCell>
										{new Date(shipment.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell className="text-right">
										<Details workspaceId={workspaceId} shipment={shipment} />
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
