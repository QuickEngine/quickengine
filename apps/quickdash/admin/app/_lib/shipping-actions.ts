"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	createShipmentCommand,
	deleteShipmentCommand,
	setShipmentStatusCommand,
	shippingSettingsSchema,
	updateShipmentTrackingCommand,
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
		access,
		actorId: session.user.id,
		settings: shippingSettingsSchema.parse(module.settings),
	} as const;
}

async function mutationContext(
	authorization: Extract<Awaited<ReturnType<typeof authorize>>, { ok: true }>,
	operation: string,
	idempotencyKey: string,
	canonicalInput: unknown,
) {
	return {
		abortSignal: new AbortController().signal,
		actor: { id: authorization.actorId, type: "user" as const },
		deadlineAtMs: Date.now() + 10_000,
		fingerprint: await fingerprintCanonicalInput(canonicalInput),
		idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
		operation,
		organizationId: authorization.access.organizationId,
		requestId: crypto.randomUUID(),
		source: "quickdash" as const,
		workspaceId: authorization.access.workspace.id,
	};
}

const outcomeFailure = (kind: "conflict" | "in_progress") =>
	failure(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This shipment change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

// Durable commands raise DomainError with copy already written for a person.
const message = (error: unknown, fallback: string) =>
	error instanceof Error && error.name === "DomainError"
		? error.message
		: fallback;

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

	try {
		const input = {
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
		};
		const context = await mutationContext(
			authorization,
			"shipments.create",
			key(formData),
			input,
		);
		const outcome = await createShipmentCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
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
			message(
				error,
				"Check the shipment quantity, destination, parcel, and tracking details.",
			),
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
	const id = String(formData.get("shipmentId") ?? "");
	try {
		const status = String(formData.get("target")) as
			| "draft"
			| "ready"
			| "shipped"
			| "in_transit"
			| "delivered"
			| "exception"
			| "cancelled";
		const options = {
			requireTracking: authorization.settings.requireTracking,
		};
		const context = await mutationContext(
			authorization,
			"shipments.set-status",
			key(formData),
			{ id, options, status },
		);
		const outcome = await setShipmentStatusCommand(
			context,
			id,
			status,
			options,
		);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(
				error,
				"That shipment can no longer move to the selected status.",
			),
		);
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
	const id = String(formData.get("shipmentId") ?? "");
	try {
		const input = {
			carrier: optional(formData.get("carrier")),
			serviceLevel: optional(formData.get("serviceLevel")),
			trackingNumber: optional(formData.get("trackingNumber")),
			trackingUrl: optional(formData.get("trackingUrl")),
		};
		const context = await mutationContext(
			authorization,
			"shipments.tracking",
			key(formData),
			{ id, input },
		);
		const outcome = await updateShipmentTrackingCommand(context, id, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(
				error,
				"Check the tracking details. Delivered shipments are locked.",
			),
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
	const id = String(formData.get("shipmentId") ?? "");
	try {
		const context = await mutationContext(
			authorization,
			"shipments.delete",
			key(formData),
			{ id },
		);
		const outcome = await deleteShipmentCommand(context, id);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "Only draft or cancelled shipments can be deleted."),
		);
	}
	revalidatePath(`/${workspaceId}/shipping`);
	return success();
}
