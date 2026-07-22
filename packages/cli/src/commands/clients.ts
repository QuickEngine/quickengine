import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerClientCommands(program: Command): void {
	const clients = program
		.command("clients")
		.description("Manage workspace client records");
	clients
		.command("list")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.action(async (options: { json?: boolean; limit: string }) => {
			const { data } = await buildClient().client.clients.list({
				limit: Number(options.limit),
			});
			if (options.json) return printJson(data);
			if (!data.items.length) return line("No clients.");
			for (const item of data.items)
				line(`${item.id}  ${item.name}${item.email ? `  ${item.email}` : ""}`);
		});
	clients
		.command("get <id>")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.clients.get(id);
			if (options.json) return printJson(data);
			line(`${data.name}  (${data.id})`);
			if (data.email) line(`  email: ${data.email}`);
			if (data.phone) line(`  phone: ${data.phone}`);
			if (data.company) line(`  company: ${data.company}`);
		});
	clients
		.command("create")
		.requiredOption("--name <name>", "Client name")
		.option("--email <email>", "Email")
		.option("--phone <phone>", "Phone")
		.option("--company <company>", "Company")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				name: string;
				email?: string;
				phone?: string;
				company?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.clients.create(
					{
						name: options.name,
						email: options.email,
						phone: options.phone,
						company: options.company,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created ${data.name} (${data.id})`);
			},
		);
}
