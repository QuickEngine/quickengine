import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

/** `2026-07-25T12:00:00.000Z` → `2026-07-25 12:00:00` — readable in a terminal. */
const stamp = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, "");

export function registerActivityCommands(program: Command): void {
	const activity = program
		.command("activity")
		.description("Read the workspace's event history");

	activity
		.command("list")
		.description("The most recent events, newest first")
		.option("--limit <n>", "How many to show")
		.option("--json", "Output JSON")
		.action(async (options: { limit?: string; json?: boolean }) => {
			const { data } = await buildClient().client.activity.list({
				limit: options.limit ? Number(options.limit) : undefined,
			});
			if (options.json) return printJson(data);
			if (!data.events.length) return line("No activity yet.");
			for (const event of data.events) {
				line(`  ${stamp(event.occurredAt)}  ${event.name}  ${event.recordId}`);
			}
			// Printed so a shell loop can page without parsing the events.
			line("");
			line(`cursor: ${data.cursor}`);
		});

	activity
		.command("since <cursor>")
		.description("Everything after a cursor, oldest first")
		.option("--limit <n>", "How many to show")
		.option("--json", "Output JSON")
		.action(
			async (cursor: string, options: { limit?: string; json?: boolean }) => {
				const { data } = await buildClient().client.activity.since(
					Number(cursor),
					{ limit: options.limit ? Number(options.limit) : undefined },
				);
				if (options.json) return printJson(data);
				if (!data.events.length) return line(`Nothing new since ${cursor}.`);
				for (const event of data.events) {
					line(
						`  ${stamp(event.occurredAt)}  ${event.name}  ${event.recordId}`,
					);
				}
				line("");
				line(`cursor: ${data.cursor}`);
			},
		);
}
