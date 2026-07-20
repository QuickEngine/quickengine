"use server";

import { getSession } from "@quickengine/auth/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@quickengine/db";
import {
	createShipment,
	deleteShipment,
	setShipmentStatus,
	shippingSettingsSchema,
	updateShipmentTracking,
} from "@quickengine/mod-shipping";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type ShippingActionState = {
	error: string | null;
	completionId: string | null;
};

const failure = (error: string): ShippingActionState => ({
	error,
	completionId: null,
});
const success = (): ShippingActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session)
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access)
		return { ok: false, error: "Workspace access was not found." } as const;
	const module = access.modules.find((item) => item.id === "shipping");
	if (!module)
		return {
			ok: false,
			error: "Shipping is not enabled for this workspace.",
		} as const;
	return {
		ok: true,
		settings: shippingSettingsSchema.parse(module.settings),
	} as const;
}

const optional = (value: FormDataEntryValue | null) =>
	String(value ?? "").trim() || null;

export async function createShipmentAction(
	_previous: ShippingActionState,
	formData: FormData,
): Promise<ShippingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	const orderLineItemId = String(formData.get("orderLineItemId") ?? "");

	const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
	const idempotencyScope = `shipping.create:${workspaceId}`;
	if (!(await claimIdempotencyKey(idempotencyKey, idempotencyScope))) {
		revalidatePath(`/${workspaceId}/shipping`);
		return success();
	}

	try {
		await createShipment(workspaceId, {
			orderId: String(formData.get("orderId") ?? ""),
			lines: [
				{
					orderLineItemId,
					quantity: Number(formData.get("quantity")),
				},
			],
			destination: {
				recipientName: String(formData.get("recipientName") ?? ""),
				company: optional(formData.get("company")),
				line1: String(formData.get("line1") ?? ""),
				line2: optional(formData.get("line2")),
				city: String(formData.get("city") ?? ""),
				region: optional(formData.get("region")),
				postalCode: optional(formData.get("postalCode")),
				countryCode: String(
					formData.get("countryCode") ??
						authorization.settings.defaultOriginCountry,
				),
				phone: optional(formData.get("phone")),
				email: optional(formData.get("email")),
			},
			parcels: [
				{
					weightGrams: Number(formData.get("weightGrams")),
					lengthMillimeters: formData.get("lengthMillimeters")
						? Number(formData.get("lengthMillimeters"))
						: null,
					widthMillimeters: formData.get("widthMillimeters")
						? Number(formData.get("widthMillimeters"))
						: null,
					heightMillimeters: formData.get("heightMillimeters")
						? Number(formData.get("heightMillimeters"))
						: null,
				},
			],
			carrier:
				optional(formData.get("carrier")) ??
				authorization.settings.defaultCarrier,
			serviceLevel: optional(formData.get("serviceLevel")),
			trackingNumber: optional(formData.get("trackingNumber")),
			trackingUrl: optional(formData.get("trackingUrl")),
		});
	} catch (error) {
		// The claim meant "we're doing the work" — the work failed, so give the key back
		// or the user's corrected retry would be swallowed as a duplicate.
		await releaseIdempotencyKey(idempotencyKey, idempotencyScope);
		if (error instanceof Error && error.message === "ORDER_LINE_OVERSHIPPED")
			return failure(
				"That quantity exceeds the order line's unallocated balance.",
			);
		if (
			error instanceof Error &&
			["ORDER_NOT_READY_FOR_SHIPPING", "ORDER_LINE_NOT_SHIPPABLE"].includes(
				error.message,
			)
		)
			return failure(
				"Choose a physical or rental line from a confirmed order.",
			);
		return failure(
			"Check the shipment quantity, destination, parcel, and tracking details.",
		);
	}
	revalidatePath(`/${workspaceId}/shipping`);
	return success();
}

export async function changeShipmentStatusAction(
	_previous: ShippingActionState,
	formData: FormData,
): Promise<ShippingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await setShipmentStatus(
			workspaceId,
			String(formData.get("shipmentId") ?? ""),
			String(formData.get("target")) as
				| "draft"
				| "ready"
				| "shipped"
				| "in_transit"
				| "delivered"
				| "exception"
				| "cancelled",
			{ requireTracking: authorization.settings.requireTracking },
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "SHIPMENT_TRACKING_REQUIRED"
		)
			return failure("Add a tracking number before marking this shipped.");
		return failure("That shipment can no longer move to the selected status.");
	}
	revalidatePath(`/${workspaceId}/shipping`);
	return success();
}

export async function updateShipmentTrackingAction(
	_previous: ShippingActionState,
	formData: FormData,
): Promise<ShippingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await updateShipmentTracking(
			workspaceId,
			String(formData.get("shipmentId") ?? ""),
			{
				carrier: optional(formData.get("carrier")),
				serviceLevel: optional(formData.get("serviceLevel")),
				trackingNumber: optional(formData.get("trackingNumber")),
				trackingUrl: optional(formData.get("trackingUrl")),
			},
		);
	} catch {
		return failure(
			"Check the tracking details. Delivered shipments are locked.",
		);
	}
	revalidatePath(`/${workspaceId}/shipping`);
	return success();
}

export async function deleteShipmentAction(
	_previous: ShippingActionState,
	formData: FormData,
): Promise<ShippingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await deleteShipment(workspaceId, String(formData.get("shipmentId") ?? ""));
	} catch {
		return failure("Only draft or cancelled shipments can be deleted.");
	}
	revalidatePath(`/${workspaceId}/shipping`);
	return success();
}
