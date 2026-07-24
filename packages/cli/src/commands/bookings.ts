import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerBookingCommands(program: Command): void {
	const bookings = program
		.command("bookings")
		.description("Manage the workspace's bookings");

	bookings
		.command("list")
		.description("List bookings")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--schedule <key>", "Only this schedule (room, person, resource)")
		.option(
			"--status <status>",
			"Filter by requested, confirmed, checked_in, completed, cancelled, or no_show",
		)
		.option("--from <iso>", "Only bookings starting at or after this time")
		.option("--to <iso>", "Only bookings starting at or before this time")
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				schedule?: string;
				status?: string;
				from?: string;
				to?: string;
			}) => {
				const { data } = await buildClient().client.bookings.list({
					limit: Number(options.limit),
					scheduleKey: options.schedule,
					status: options.status as never,
					from: options.from,
					to: options.to,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No bookings.");
				for (const item of data.items)
					line(
						`${item.id}  [${item.status}]  ${item.startsAt}  ${item.scheduleKey}  ${item.title}`,
					);
			},
		);

	bookings
		.command("get <id>")
		.description("Show one booking")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.bookings.get(id);
			if (options.json) return printJson(data);
			line(`${data.title}  (${data.id})`);
			line(`  status:   ${data.status}`);
			line(`  schedule: ${data.scheduleKey}`);
			line(`  when:     ${data.startsAt} to ${data.endsAt} (${data.timeZone})`);
			if (data.clientName) line(`  client:   ${data.clientName}`);
			if (data.cancellationReason)
				line(`  cancelled: ${data.cancellationReason}`);
		});

	bookings
		.command("create")
		.description("Book a slot")
		.requiredOption("--client <id>", "Client id")
		.requiredOption("--title <text>", "What the booking is for")
		.requiredOption("--starts <iso>", "Start time, ISO 8601")
		.requiredOption("--ends <iso>", "End time, ISO 8601")
		.option("--time-zone <zone>", "IANA time zone", "UTC")
		.option("--schedule <key>", "Schedule this booking competes for", "default")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				client: string;
				title: string;
				starts: string;
				ends: string;
				timeZone: string;
				schedule: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.bookings.create(
					{
						clientId: options.client,
						title: options.title,
						startsAt: options.starts,
						endsAt: options.ends,
						timeZone: options.timeZone,
						scheduleKey: options.schedule,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Booked ${data.title} (${data.id}) at ${data.startsAt}`);
			},
		);

	bookings
		.command("status <id> <status>")
		.description(
			"Move a booking between requested, confirmed, checked_in, completed, cancelled, and no_show",
		)
		.option("--reason <text>", "Cancellation reason (when cancelling)")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: {
					reason?: string;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.bookings.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
					{ cancellationReason: options.reason ?? null },
				);
				if (options.json) return printJson(data);
				line(`${data.title} is now ${data.status}`);
			},
		);
}
