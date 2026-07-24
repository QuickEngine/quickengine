"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	bookingsSettingsSchema,
	createBookingCommand,
	deleteBookingCommand,
	setBookingStatusCommand,
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
		access,
		actorId: session.user.id,
		settings: bookingsSettingsSchema.parse(module.settings),
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
			: "This booking change is still being processed. Try again shortly.",
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

export async function createBookingAction(
	_previous: BookingActionState,
	formData: FormData,
): Promise<BookingActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);

	try {
		const input = {
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
		};
		const context = await mutationContext(
			authorization,
			"bookings.create",
			key(formData),
			input,
		);
		const outcome = await createBookingCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(
				error,
				"Check the client, times, timezone, location, and booking details.",
			),
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
	const id = String(formData.get("bookingId") ?? "");
	try {
		const status = String(formData.get("target")) as
			| "confirmed"
			| "checked_in"
			| "completed"
			| "cancelled"
			| "no_show";
		const options = {
			cancellationReason: optional(formData.get("cancellationReason")),
		};
		const context = await mutationContext(
			authorization,
			"bookings.set-status",
			key(formData),
			{ id, options, status },
		);
		const outcome = await setBookingStatusCommand(context, id, status, options);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "That booking can no longer move to the selected status."),
		);
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
	const id = String(formData.get("bookingId") ?? "");
	try {
		const context = await mutationContext(
			authorization,
			"bookings.delete",
			key(formData),
			{ id },
		);
		const outcome = await deleteBookingCommand(context, id);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "Only requested or cancelled bookings can be deleted."),
		);
	}
	revalidatePath(`/${workspaceId}/bookings`);
	return success();
}
