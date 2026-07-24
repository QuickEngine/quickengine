"use server";
import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	approveTimeEntryCommand,
	createManualTimeEntryCommand,
	startTimerCommand,
	stopTimerCommand,
	timeTrackingSettingsSchema,
	voidTimeEntryCommand,
} from "@quickengine/mod-time-tracking";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";
export type TimeActionState = {
	error: string | null;
	completionId: string | null;
};
const fail = (error: string): TimeActionState => ({
	error,
	completionId: null,
});
const ok = (): TimeActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});
async function auth(w: string) {
	const s = await getSession(await headers());
	if (!s) return { ok: false, error: "Session expired." } as const;
	const a = await requireWorkspaceAccess(s.user.id, w);
	if (!a)
		return { ok: false, error: "Workspace access was not found." } as const;
	const m = a.modules.find((x) => x.id === "time-tracking");
	if (!m) return { ok: false, error: "Time Tracking is not enabled." } as const;
	return {
		ok: true,
		access: a,
		actorId: s.user.id,
		settings: timeTrackingSettingsSchema.parse(m.settings),
	} as const;
}

async function mutationContext(
	authorization: Extract<Awaited<ReturnType<typeof auth>>, { ok: true }>,
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
	fail(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This time change is still being processed. Try again shortly.",
	);

const key = (f: FormData) => String(f.get("idempotencyKey") ?? "");

// Durable commands raise DomainError with copy already written for a person.
const message = (error: unknown, fallback: string) =>
	error instanceof Error && error.name === "DomainError"
		? error.message
		: fallback;

const opt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function addTimeAction(_: TimeActionState, f: FormData) {
	const w = String(f.get("workspaceId"));
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		const input = {
			projectId: String(f.get("projectId")),
			taskId: opt(f.get("taskId")),
			workDate: String(f.get("workDate")),
			durationSeconds: Number(f.get("minutes")) * 60,
			description: opt(f.get("description")),
			billable: f.get("billable") === "on",
			hourlyRateCents: f.get("rate")
				? Math.round(Number(f.get("rate")) * 100)
				: null,
			currency: a.settings.defaultCurrency,
		};
		const context = await mutationContext(a, "time.create", key(f), input);
		const outcome = await createManualTimeEntryCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(message(error, "Check the project, task, duration, and rate."));
	}
	revalidatePath(`/${w}/time-tracking`);
	return ok();
}

export async function timerAction(_: TimeActionState, f: FormData) {
	const w = String(f.get("workspaceId"));
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const id = opt(f.get("id"));
	try {
		if (id) {
			const endedAt = new Date();
			const context = await mutationContext(a, "time.stop", key(f), {
				endedAt: endedAt.toISOString(),
				id,
			});
			const outcome = await stopTimerCommand(context, id, endedAt);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		} else {
			const input = {
				projectId: String(f.get("projectId")),
				taskId: opt(f.get("taskId")),
				startedAt: new Date(),
				timeZone: a.settings.defaultTimeZone,
				billable: a.settings.defaultBillable,
				hourlyRateCents: a.settings.defaultHourlyRateCents,
				currency: a.settings.defaultCurrency,
			};
			const context = await mutationContext(a, "time.start", key(f), input);
			const outcome = await startTimerCommand(context, input);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		}
	} catch (error) {
		return fail(message(error, "The timer could not be changed."));
	}
	revalidatePath(`/${w}/time-tracking`);
	return ok();
}

export async function reviewTimeAction(_: TimeActionState, f: FormData) {
	const w = String(f.get("workspaceId"));
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const id = String(f.get("id"));
	const approving = f.get("target") === "approved";
	try {
		if (approving) {
			const context = await mutationContext(a, "time.approve", key(f), {
				id,
				rounding: a.settings.billingRounding,
			});
			const outcome = await approveTimeEntryCommand(
				context,
				id,
				a.settings.billingRounding,
			);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		} else {
			const context = await mutationContext(a, "time.void", key(f), { id });
			const outcome = await voidTimeEntryCommand(context, id);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		}
	} catch (error) {
		return fail(message(error, "That entry cannot be changed."));
	}
	revalidatePath(`/${w}/time-tracking`);
	return ok();
}
