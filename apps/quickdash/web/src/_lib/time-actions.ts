import { workspaceApi } from "../lib/api";
import type { QuickDashContext } from "../lib/quickdash-api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type TimeActionState = ActionState;
const optional = (value: FormDataEntryValue | null) =>
	String(value ?? "").trim() || null;

type TimeSettings = {
	defaultCurrency?: string;
	defaultTimeZone?: string;
	defaultBillable?: boolean;
	defaultHourlyRateCents?: number | null;
	billingRounding?: {
		mode?: "none" | "nearest" | "up" | "down";
		incrementMinutes?: number;
	};
};

async function settings(workspaceId: string) {
	const context = (
		await workspaceApi(workspaceId).request<QuickDashContext>(
			"/quickdash/context",
		)
	).data;
	return (context.modules.find((module) => module.id === "time-tracking")
		?.settings ?? {}) as TimeSettings;
}

export function addTimeAction(_previous: TimeActionState, form: FormData) {
	const workspaceId = String(form.get("workspaceId") ?? "");
	const api = workspaceApi(workspaceId);
	return actionResult(async () => {
		const config = await settings(workspaceId);
		await api.time.log(
			{
				projectId: String(form.get("projectId") ?? ""),
				taskId: optional(form.get("taskId")),
				workDate: String(form.get("workDate") ?? ""),
				durationSeconds: Number(form.get("minutes")) * 60,
				description: optional(form.get("description")),
				billable: form.get("billable") === "on",
				hourlyRateCents: form.get("rate")
					? Math.round(Number(form.get("rate")) * 100)
					: null,
				currency: config.defaultCurrency ?? "USD",
			},
			idempotencyKey(form),
		);
	}, "Check the project, task, duration, and rate.");
}

export function timerAction(_previous: TimeActionState, form: FormData) {
	const workspaceId = String(form.get("workspaceId") ?? "");
	const api = workspaceApi(workspaceId);
	return actionResult(async () => {
		const id = optional(form.get("id"));
		if (id) {
			await api.time.stopTimer(id, new Date(), idempotencyKey(form));
			return;
		}
		const config = await settings(workspaceId);
		await api.time.startTimer(
			{
				projectId: String(form.get("projectId") ?? ""),
				taskId: optional(form.get("taskId")),
				startedAt: new Date(),
				timeZone: config.defaultTimeZone ?? "UTC",
				billable: config.defaultBillable ?? false,
				hourlyRateCents: config.defaultHourlyRateCents ?? null,
				currency: config.defaultCurrency ?? "USD",
			},
			idempotencyKey(form),
		);
	}, "The timer could not be changed.");
}

export function reviewTimeAction(_previous: TimeActionState, form: FormData) {
	const workspaceId = String(form.get("workspaceId") ?? "");
	const api = workspaceApi(workspaceId);
	const id = String(form.get("id") ?? "");
	return actionResult(async () => {
		const key = idempotencyKey(form);
		if (form.get("target") !== "approved") {
			await api.time.void(id, key);
			return;
		}
		const config = await settings(workspaceId);
		const rounding = config.billingRounding;
		await api.time.approve(id, key, {
			mode:
				rounding?.mode === "none" ? undefined : (rounding?.mode ?? "nearest"),
			incrementMinutes: rounding?.incrementMinutes ?? 1,
		});
	}, "That entry cannot be changed.");
}
