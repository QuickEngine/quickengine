"use server";
import { getSession } from "@quickengine/auth/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@quickengine/db";
import {
	approveTimeEntry,
	createManualTimeEntry,
	startTimer,
	stopTimeEntryTimer,
	timeTrackingSettingsSchema,
	voidTimeEntry,
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
	const m = a?.modules.find((x) => x.id === "time-tracking");
	if (!m) return { ok: false, error: "Time Tracking is not enabled." } as const;
	return {
		ok: true,
		settings: timeTrackingSettingsSchema.parse(m.settings),
	} as const;
}
const opt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
export async function addTimeAction(_: TimeActionState, f: FormData) {
	const w = String(f.get("workspaceId"));
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const key = String(f.get("idempotencyKey") ?? "");
	const scope = `time.create:${w}`;
	if (!(await claimIdempotencyKey(key, scope))) {
		revalidatePath(`/${w}/time-tracking`);
		return ok();
	}
	try {
		await createManualTimeEntry(w, {
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
		});
	} catch {
		// Failed work must give the key back, or the corrected retry is read as a duplicate.
		await releaseIdempotencyKey(key, scope);
		return fail("Check the project, task, duration, and rate.");
	}
	revalidatePath(`/${w}/time-tracking`);
	return ok();
}
export async function timerAction(_: TimeActionState, f: FormData) {
	const w = String(f.get("workspaceId"));
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		if (f.get("id"))
			await stopTimeEntryTimer(w, String(f.get("id")), new Date());
		else
			await startTimer(w, {
				projectId: String(f.get("projectId")),
				taskId: opt(f.get("taskId")),
				startedAt: new Date(),
				timeZone: a.settings.defaultTimeZone,
				billable: a.settings.defaultBillable,
				hourlyRateCents: a.settings.defaultHourlyRateCents,
				currency: a.settings.defaultCurrency,
			});
	} catch {
		return fail("The timer could not be changed.");
	}
	revalidatePath(`/${w}/time-tracking`);
	return ok();
}
export async function reviewTimeAction(_: TimeActionState, f: FormData) {
	const w = String(f.get("workspaceId"));
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		f.get("target") === "approved"
			? await approveTimeEntry(
					w,
					String(f.get("id")),
					a.settings.billingRounding,
				)
			: await voidTimeEntry(w, String(f.get("id")));
	} catch {
		return fail("That entry cannot be changed.");
	}
	revalidatePath(`/${w}/time-tracking`);
	return ok();
}
