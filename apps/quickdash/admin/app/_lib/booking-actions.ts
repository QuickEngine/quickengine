"use server";

import { getSession } from "@quickengine/auth/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@quickengine/db";
import {
	bookingsSettingsSchema,
	createBooking,
	deleteBooking,
	setBookingStatus,
} from "@quickengine/mod-bookings";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type BookingActionState = {
	error: string | null;
	completionId: string | null;
};
const failure = (error: string): BookingActionState => ({
	error,
	completionId: null,
});
const success = (): BookingActionState => ({
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
	const module = access.modules.find((item) => item.id === "bookings");
	if (!module)
		return {
			ok: false,
			error: "Bookings is not enabled for this workspace.",
		} as const;
	return {
		ok: true,
		settings: bookingsSettingsSchema.parse(module.settings),
	} as const;
}
const optional = (value: FormDataEntryValue | null) =>
	String(value ?? "").trim() || null;

export async function createBookingAction(
	_previous: BookingActionState,
	formData: FormData,
): Promise<BookingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);

	const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
	const idempotencyScope = `bookings.create:${workspaceId}`;
	if (!(await claimIdempotencyKey(idempotencyKey, idempotencyScope))) {
		revalidatePath(`/${workspaceId}/bookings`);
		return success();
	}

	try {
		await createBooking(workspaceId, {
			clientId: String(formData.get("clientId") ?? ""),
			title: String(formData.get("title") ?? ""),
			scheduleKey: String(formData.get("scheduleKey") ?? "default"),
			startsAt: String(formData.get("startsAt") ?? ""),
			endsAt: String(formData.get("endsAt") ?? ""),
			timeZone: String(
				formData.get("timeZone") ?? authorization.settings.defaultTimeZone,
			),
			locationKind: String(formData.get("locationKind")) as
				| "in_person"
				| "virtual"
				| "phone"
				| "other",
			location: optional(formData.get("location")),
			notes: optional(formData.get("notes")),
		});
	} catch (error) {
		// The claim meant "we're doing the work" — the work failed, so give the key back
		// or the user's corrected retry would be swallowed as a duplicate.
		await releaseIdempotencyKey(idempotencyKey, idempotencyScope);
		if (error instanceof Error && error.message === "BOOKING_SCHEDULE_CONFLICT")
			return failure("That schedule already has an overlapping booking.");
		return failure(
			"Check the client, times, timezone, location, and booking details.",
		);
	}
	revalidatePath(`/${workspaceId}/bookings`);
	return success();
}

export async function changeBookingStatusAction(
	_previous: BookingActionState,
	formData: FormData,
): Promise<BookingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await setBookingStatus(
			workspaceId,
			String(formData.get("bookingId") ?? ""),
			String(formData.get("target")) as
				| "confirmed"
				| "checked_in"
				| "completed"
				| "cancelled"
				| "no_show",
			{ cancellationReason: optional(formData.get("cancellationReason")) },
		);
	} catch {
		return failure("That booking can no longer move to the selected status.");
	}
	revalidatePath(`/${workspaceId}/bookings`);
	return success();
}

export async function deleteBookingAction(
	_previous: BookingActionState,
	formData: FormData,
): Promise<BookingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await deleteBooking(workspaceId, String(formData.get("bookingId") ?? ""));
	} catch {
		return failure("Only requested or cancelled bookings can be deleted.");
	}
	revalidatePath(`/${workspaceId}/bookings`);
	return success();
}
