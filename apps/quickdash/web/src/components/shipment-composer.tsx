import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { parseAmount } from "../lib/money-input";
import { CreatePanel } from "./create-panel";
import { WriteFailure } from "./page-state";
import { Text as TextField } from "./product-fields";

/**
 * Fulfilling an order.
 *
 * 🔑 Opened FROM an order, never from the shipments list. Nobody creates a
 * shipment in the abstract — they are looking at an order somebody paid for and
 * deciding to send it. That is why there is no "new shipment" button on the
 * list: it would ask which order, which is the question the operator has
 * already answered by being here.
 *
 * 🔴 Everything the API needs is ALREADY KNOWN except the parcel. The order
 * carries the delivery address it captured at checkout and the lines it was
 * paid for, so this form prefills both and asks only for what genuinely cannot
 * be inferred. A fulfilment screen that re-asks for an address the order is
 * holding is the reason this one never felt worth building.
 */

type OrderLine = {
	id: string;
	name: string;
	quantity: number;
	/** Already gone out on a shipment that was not cancelled. */
	shippedQuantity?: number;
	/** Still owed. What this form actually offers to send. */
	outstandingQuantity?: number;
};

const outstanding = (line: OrderLine) =>
	line.outstandingQuantity ??
	Math.max(0, line.quantity - (line.shippedQuantity ?? 0));

/**
 * The subset of the operator order detail this needs.
 *
 * ⚠️ The address arrives as FLAT `shipTo*` fields, not a nested object. The
 * detail route spreads the order DTO into its response, and the DTO stores the
 * address column by column.
 */
export type ShippableOrder = {
	id: string;
	number: string;
	lineItems: OrderLine[];
	shipToName?: string | null;
	shipToLine1?: string | null;
	shipToLine2?: string | null;
	shipToCity?: string | null;
	shipToRegion?: string | null;
	shipToPostalCode?: string | null;
	shipToCountryCode?: string | null;
};

/**
 * Why this order cannot be shipped yet, or null when it can.
 *
 * 🔴 Returns the REASON rather than a boolean. Both conditions below are things
 * the server enforces and the operator cannot guess: a `placed` order is refused
 * with "Only a confirmed or processing order can be shipped", which arrives
 * after the form has been filled in. Saying it up front costs one sentence.
 */
export function shipBlockedReason(
	order: ShippableOrder & { status?: string },
): string | null {
	if (order.status === "confirmed" || order.status === "processing") {
		// Allowed. Fall through to the address check.
	} else if (order.status === "placed") {
		return "Confirm this order before shipping it.";
	} else if (order.status) {
		return `A ${order.status} order cannot be shipped.`;
	}

	if (order.lineItems.length === 0) return "This order has nothing on it.";
	if (order.lineItems.every((line) => outstanding(line) === 0)) {
		return "Everything on this order has been shipped.";
	}
	if (
		!(
			order.shipToName?.trim() &&
			order.shipToLine1?.trim() &&
			order.shipToCity?.trim() &&
			order.shipToCountryCode?.trim()
		)
	) {
		return "This order has no delivery address, so it cannot be shipped.";
	}
	return null;
}

export function ShipmentComposer({
	workspaceId,
	order,
	onClose,
}: {
	workspaceId: string;
	order: ShippableOrder;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [weight, setWeight] = useState("");
	const [carrier, setCarrier] = useState("");
	const [tracking, setTracking] = useState("");

	/**
	 * How much of each line is going in this parcel.
	 *
	 * 🔴 Keyed by order line id and defaulted to the full quantity, because the
	 * common case is shipping the whole order. Editing one down is what makes a
	 * PARTIAL shipment, and the API refuses to see the same line twice inside one
	 * shipment — so shipping 1 of 2 now and 1 later is deliberately two
	 * shipments, not one line entered twice.
	 */
	const [quantities, setQuantities] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			order.lineItems.map((line) => [line.id, String(outstanding(line))]),
		),
	);

	// Lines with nothing left to send are not offered at all. Showing a row that
	// can only be zero invites somebody to type into it and be refused.
	const shippable = order.lineItems.filter((line) => outstanding(line) > 0);

	const lines = shippable
		.map((line) => ({
			orderLineItemId: line.id,
			quantity: Math.floor(parseAmount(quantities[line.id] ?? "") ?? 0),
		}))
		.filter((line) => line.quantity > 0);

	// Grams are whole, and the API refuses anything that is not a positive
	// integer. Tolerant of "340g" for the same reason every amount field is.
	const parsedWeight = parseAmount(weight);
	const weightGrams =
		parsedWeight === null ? null : Math.round(Math.max(0, parsedWeight));
	const weightValid = weightGrams !== null && weightGrams > 0;

	const overShipped = shippable.some((line) => {
		const wanted = Math.floor(parseAmount(quantities[line.id] ?? "") ?? 0);
		return wanted > outstanding(line);
	});

	const create = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request("/shipments", {
				method: "POST",
				body: {
					orderId: order.id,
					lines,
					destination: {
						recipientName: order.shipToName?.trim(),
						line1: order.shipToLine1?.trim(),
						line2: order.shipToLine2?.trim() || null,
						city: order.shipToCity?.trim(),
						region: order.shipToRegion?.trim() || null,
						postalCode: order.shipToPostalCode?.trim() || null,
						countryCode: order.shipToCountryCode?.trim().toUpperCase(),
					},
					parcels: [{ weightGrams }],
					carrier: carrier.trim() || null,
					// Tracking may be attached later through the shipment itself; an
					// operator packing a box rarely has the number yet.
					trackingNumber: tracking.trim() || null,
				},
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That shipment could not be created.",
			}),
		onSuccess: async () => {
			// Both the order (its shipment list grows) and the shipments page.
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["quickdash", workspaceId, "order", order.id],
				}),
				queryClient.invalidateQueries({
					queryKey: ["quickdash", workspaceId, "shipments"],
				}),
			]);
			onClose();
		},
	});

	return (
		<CreatePanel
			title={`Ship order ${order.number}`}
			submitLabel="Create shipment"
			busy={create.isPending}
			valid={weightValid && lines.length > 0 && !overShipped}
			failure={failure}
			onClose={onClose}
			onSubmit={() => create.mutate()}
		>
			{/* Read-only: this came off the order and retyping it is how a parcel
			    ends up at an address the customer never gave. */}
			<div className="rounded-lg border border-[var(--console-line-soft)] px-3 py-2.5">
				<p className="mb-1 text-[10.5px] text-[var(--ink-45)]">Delivering to</p>
				<p className="text-[12px] text-[var(--ink-85)] leading-relaxed">
					{order.shipToName}
					<br />
					{order.shipToLine1}
					{order.shipToLine2 ? (
						<>
							<br />
							{order.shipToLine2}
						</>
					) : null}
					<br />
					{[order.shipToCity, order.shipToRegion, order.shipToPostalCode]
						.filter(Boolean)
						.join(", ")}
					<br />
					{order.shipToCountryCode}
				</p>
			</div>

			<div>
				<p className="mb-2 text-[11px] text-[var(--ink-45)]">
					What is in this parcel
				</p>
				<div className="grid gap-1.5">
					{shippable.map((line) => (
						<div
							key={line.id}
							className="flex items-center gap-2 rounded-lg border border-[var(--console-line-soft)] px-3 py-2"
						>
							<p className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-85)]">
								{line.name}
							</p>
							<span className="shrink-0 text-[10.5px] text-[var(--ink-30)]">
								of {outstanding(line)} left
							</span>
							<input
								value={quantities[line.id] ?? ""}
								onChange={(event) =>
									setQuantities((current) => ({
										...current,
										[line.id]: event.target.value,
									}))
								}
								inputMode="numeric"
								className="h-7 w-14 shrink-0 rounded-full border border-[var(--console-line-strong)] bg-transparent px-2.5 text-[11px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)]"
							/>
						</div>
					))}
				</div>
				{overShipped ? (
					<WriteFailure message="A shipment cannot contain more of a line than is still outstanding." />
				) : (
					<p className="mt-1.5 text-[10.5px] text-[var(--ink-30)]">
						Send less than the full quantity to make a partial shipment. The
						rest stays outstanding and ships separately.
					</p>
				)}
			</div>

			<TextField
				label="Parcel weight"
				hint="grams, required by the carrier"
				value={weight}
				onChange={setWeight}
				placeholder="480"
				inputMode="decimal"
			/>
			<TextField
				label="Carrier"
				hint="optional"
				value={carrier}
				onChange={setCarrier}
				placeholder="Canada Post"
			/>
			<TextField
				label="Tracking number"
				hint="optional, can be added once you have it"
				value={tracking}
				onChange={setTracking}
			/>
		</CreatePanel>
	);
}
