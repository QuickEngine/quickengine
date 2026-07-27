import type { QuickShipmentStatus } from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import type { QuickDashContext } from "../lib/quickdash-api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type ShippingActionState = ActionState;
const optional = (value: FormDataEntryValue | null) =>
	String(value ?? "").trim() || null;

export function createShipmentAction(
	_previous: ShippingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.shipments.create(
				{
					orderId: String(form.get("orderId") ?? ""),
					lines: [
						{
							orderLineItemId: String(form.get("orderLineItemId") ?? ""),
							quantity: Number(form.get("quantity")),
						},
					],
					destination: {
						recipientName: String(form.get("recipientName") ?? ""),
						company: optional(form.get("company")),
						line1: String(form.get("line1") ?? ""),
						line2: optional(form.get("line2")),
						city: String(form.get("city") ?? ""),
						region: optional(form.get("region")),
						postalCode: optional(form.get("postalCode")),
						countryCode: String(form.get("countryCode") ?? ""),
						phone: optional(form.get("phone")),
						email: optional(form.get("email")),
					},
					parcels: [
						{
							weightGrams: Number(form.get("weightGrams")),
							lengthMillimeters: form.get("lengthMillimeters")
								? Number(form.get("lengthMillimeters"))
								: null,
							widthMillimeters: form.get("widthMillimeters")
								? Number(form.get("widthMillimeters"))
								: null,
							heightMillimeters: form.get("heightMillimeters")
								? Number(form.get("heightMillimeters"))
								: null,
						},
					],
					carrier: optional(form.get("carrier")),
					serviceLevel: optional(form.get("serviceLevel")),
					trackingNumber: optional(form.get("trackingNumber")),
					trackingUrl: optional(form.get("trackingUrl")),
				},
				idempotencyKey(form),
			),
		"Check the shipment quantity, destination, parcel, and tracking details.",
	);
}

export function changeShipmentStatusAction(
	_previous: ShippingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(async () => {
		const context = (await api.request<QuickDashContext>("/quickdash/context"))
			.data;
		const settings = context.modules.find((module) => module.id === "shipping")
			?.settings as { requireTracking?: boolean } | undefined;
		return api.shipments.setStatus(
			String(form.get("shipmentId") ?? ""),
			String(form.get("target")) as QuickShipmentStatus,
			idempotencyKey(form),
			{ requireTracking: settings?.requireTracking ?? false },
		);
	}, "That shipment can no longer move to the selected status.");
}

export function updateShipmentTrackingAction(
	_previous: ShippingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.shipments.updateTracking(
				String(form.get("shipmentId") ?? ""),
				{
					carrier: optional(form.get("carrier")),
					serviceLevel: optional(form.get("serviceLevel")),
					trackingNumber: optional(form.get("trackingNumber")),
					trackingUrl: optional(form.get("trackingUrl")),
				},
				idempotencyKey(form),
			),
		"Check the tracking details. Delivered shipments are locked.",
	);
}

export function deleteShipmentAction(
	_previous: ShippingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.shipments.delete(
				String(form.get("shipmentId") ?? ""),
				idempotencyKey(form),
			),
		"Only draft or cancelled shipments can be deleted.",
	);
}
