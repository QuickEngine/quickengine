import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerInvoiceCommands(program: Command): void {
	const invoices = program
		.command("invoices")
		.description("Manage the workspace's invoices");

	invoices
		.command("list")
		.description("List invoices")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--status <status>", "Filter by draft, sent, paid, or void")
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.invoices.list({
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No invoices.");
				for (const invoice of data.items)
					line(
						`${invoice.id}  ${invoice.number}  [${invoice.status}]  ${(invoice.totalCents / 100).toFixed(2)} ${invoice.currency}`,
					);
			},
		);

	invoices
		.command("get <id>")
		.description("Show one invoice with its line items")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.invoices.get(id);
			if (options.json) return printJson(data);
			line(`${data.number}  (${data.id})`);
			line(`  status: ${data.status}`);
			line(`  total:  ${(data.totalCents / 100).toFixed(2)} ${data.currency}`);
			for (const item of data.lineItems ?? [])
				line(
					`    ${item.quantity} x ${item.description}  ${(item.unitPriceCents / 100).toFixed(2)} ${data.currency}`,
				);
		});

	invoices
		.command("create")
		.description("Create a single-line invoice")
		.requiredOption("--description <text>", "Line item description")
		.requiredOption("--price-cents <cents>", "Unit price in integer cents")
		.option("--quantity <quantity>", "Quantity", "1")
		.option("--client <id>", "Client id")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				description: string;
				priceCents: string;
				quantity: string;
				client?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.invoices.create(
					{
						clientId: options.client ?? null,
						lineItems: [
							{
								description: options.description,
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
