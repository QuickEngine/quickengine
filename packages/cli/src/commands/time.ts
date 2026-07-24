import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

const hours = (seconds: number) => (seconds / 3600).toFixed(2);

export function registerTimeCommands(program: Command): void {
	const time = program
		.command("time")
		.description("Track, approve, and invoice the workspace's time");

	time
		.command("list")
		.description("List time entries")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--project <id>", "Only this project")
		.option("--tracker <key>", "Only this tracker")
		.option(
			"--status <status>",
			"Filter by running, draft, approved, invoiced, or void",
		)
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				project?: string;
				tracker?: string;
				status?: string;
			}) => {
				const { data } = await buildClient().client.time.list({
					limit: Number(options.limit),
					projectId: options.project,
					trackerKey: options.tracker,
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No time entries.");
				for (const item of data.items)
					line(
						`${item.id}  [${item.status}]  ${hours(item.durationSeconds)}h  ${item.trackerKey}${item.billable ? "" : "  (non-billable)"}`,
					);
			},
		);

	time
		.command("log")
		.description("Log time after the fact")
		.requiredOption("--project <id>", "Project id")
		.requiredOption("--date <YYYY-MM-DD>", "Work date")
		.requiredOption("--minutes <number>", "Duration in minutes")
		.option("--description <text>", "What the time was for")
		.option("--tracker <key>", "Tracker this belongs to")
		.option("--non-billable", "Mark the time non-billable")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				project: string;
				date: string;
				minutes: string;
				description?: string;
				tracker?: string;
				nonBillable?: boolean;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.time.log(
					{
						projectId: options.project,
						workDate: options.date,
						durationSeconds: Number(options.minutes) * 60,
						description: options.description ?? null,
						trackerKey: options.tracker,
						billable: !options.nonBillable,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Logged ${hours(data.durationSeconds)}h (${data.id})`);
			},
		);

	time
		.command("start")
		.description("Start a timer")
		.requiredOption("--project <id>", "Project id")
		.option("--tracker <key>", "Tracker this timer is exclusive on")
		.option("--time-zone <zone>", "IANA time zone", "UTC")
		.option("--description <text>", "What you're working on")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				project: string;
				tracker?: string;
				timeZone: string;
				description?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.time.startTimer(
					{
						projectId: options.project,
						startedAt: new Date(),
						timeZone: options.timeZone,
						trackerKey: options.tracker,
						description: options.description ?? null,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Timer started (${data.id}) on ${data.trackerKey}`);
			},
		);

	time
		.command("stop <id>")
		.description("Stop a running timer")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.time.stopTimer(
					id,
					new Date(),
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Timer stopped: ${hours(data.durationSeconds)}h recorded`);
			},
		);

	time
		.command("approve <id>")
		.description("Approve time, applying the workspace's billing rounding")
		.option("--mode <mode>", "nearest, up, or down")
		.option("--increment <minutes>", "Rounding increment in minutes")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				options: {
					mode?: string;
					increment?: string;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.time.approve(
					id,
					options.idempotencyKey ?? randomUUID(),
					{
						mode: options.mode as never,
						incrementMinutes: options.increment
							? Number(options.increment)
							: undefined,
					},
				);
				if (options.json) return printJson(data);
				line(`Approved ${hours(data.durationSeconds)}h (${data.id})`);
			},
		);

	time
		.command("invoice <invoiceId> <entryIds...>")
		.description("Attach approved billable time to a draft invoice")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				invoiceId: string,
				entryIds: string[],
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.time.attachToInvoice(
					invoiceId,
					entryIds,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Attached ${data.entryIds.length} entries to ${data.invoiceId}`);
			},
		);
}
