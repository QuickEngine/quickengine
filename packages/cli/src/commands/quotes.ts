import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerQuoteCommands(program: Command): void {
	const quotes = program
		.command("quotes")
		.description("Manage the workspace's quotes and estimates");

	quotes
		.command("list")
		.description("List quotes")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--status <status>", "Filter by status (draft, sent, accepted, …)")
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.quotes.list({
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No quotes.");
				for (const quote of data.items)
					line(
						`${quote.id}  ${quote.number}  ${quote.title}  [${quote.status}]  ${(quote.totalCents / 100).toFixed(2)} ${quote.currency}`,
					);
			},
		);

	quotes
		.command("get <id>")
		.description("Show one quote with its line items")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.quotes.get(id);
			if (options.json) return printJson(data);
			line(`${data.number}  ${data.title}  (${data.id})`);
			line(`  status:   ${data.status}`);
			line(`  client:   ${data.clientName}`);
			line(
				`  total:    ${(data.totalCents / 100).toFixed(2)} ${data.currency}`,
			);
			for (const item of data.lines ?? [])
				line(
					`    ${item.quantity} x ${item.name}  ${(item.lineTotalCents / 100).toFixed(2)} ${data.currency}`,
				);
		});

	quotes
		.command("create")
		.description("Create a single-line quote")
		.requiredOption("--client <id>", "Client id")
		.requiredOption("--title <title>", "Quote title")
		.requiredOption("--line-name <name>", "Line item name")
		.requiredOption("--price-cents <cents>", "Unit price in integer cents")
		.option("--quantity <quantity>", "Quantity", "1")
		.option("--kind <kind>", "quote, estimate, or proposal")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				client: string;
				title: string;
				lineName: string;
				priceCents: string;
				quantity: string;
				kind?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.quotes.create(
					{
						clientId: options.client,
						title: options.title,
						kind: options.kind as never,
						lines: [
							{
								name: options.lineName,
								quantity: Number(options.quantity),
								unitPriceCents: Number(options.priceCents),
							},
						],
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created ${data.number} (${data.id})`);
			},
		);
}
