import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerFulfillmentCommands(program: Command): void {
	const fulfillments = program
		.command("fulfillments")
		.description("Manage the workspace's deliveries");

	fulfillments
		.command("list")
		.description("List deliveries")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option(
			"--status <status>",
			"Filter by pending, in_progress, fulfilled, failed, or cancelled",
		)
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.fulfillments.list({
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No deliveries.");
				for (const item of data.items)
					line(`${item.id}  [${item.status}]  ${item.kind}  ${item.title}`);
			},
		);

	fulfillments
		.command("get <id>")
		.description("Show one delivery")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.fulfillments.get(id);
			if (options.json) return printJson(data);
			line(`${data.title}  (${data.id})`);
			line(`  status: ${data.status}`);
			line(`  kind:   ${data.kind}`);
			if (data.clientName) line(`  client: ${data.clientName}`);
			if (data.sourceModule)
				line(`  source: ${data.sourceModule} ${data.sourceRecordId ?? ""}`);
		});

	fulfillments
		.command("status <id> <status>")
		.description(
			"Move a delivery between pending, in_progress, fulfilled, failed, and cancelled",
		)
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.fulfillments.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`${data.title} is now ${data.status}`);
			},
		);
}
