import type { QuickBookingStatus } from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type BookingActionState = ActionState;
const optional = (value: FormDataEntryValue | null) =>
	String(value ?? "").trim() || null;

export function createBookingAction(
	_previous: BookingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.request("/bookings", {
				method: "POST",
				body: {
					clientId: String(form.get("clientId") ?? ""),
					title: String(form.get("title") ?? ""),
					scheduleKey: String(form.get("scheduleKey") ?? "default"),
					startsAt: String(form.get("startsAt") ?? ""),
					endsAt: String(form.get("endsAt") ?? ""),
					timeZone: String(form.get("timeZone") ?? "UTC"),
					locationKind: String(form.get("locationKind")) as
						| "in_person"
						| "virtual"
						| "phone"
						| "other",
					location: optional(form.get("location")),
					notes: optional(form.get("notes")),
				},
				idempotencyKey: idempotencyKey(form),
			}),
		"Check the client, times, timezone, location, and booking details.",
	);
}

export function changeBookingStatusAction(
	_previous: BookingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.bookings.setStatus(
				String(form.get("bookingId") ?? ""),
				String(form.get("target")) as QuickBookingStatus,
				idempotencyKey(form),
				{ cancellationReason: optional(form.get("cancellationReason")) },
			),
		"That booking can no longer move to the selected status.",
	);
}

export function deleteBookingAction(
	_previous: BookingActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.bookings.delete(
				String(form.get("bookingId") ?? ""),
				idempotencyKey(form),
			),
		"Only requested or cancelled bookings can be deleted.",
	);
}
