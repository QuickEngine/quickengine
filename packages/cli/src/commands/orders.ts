import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerOrderCommands(program: Command): void {
	const orders = program
		.command("orders")
		.description("Manage the workspace's orders");

	orders
		.command("list")
		.description("List orders")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option(
			"--status <status>",
			"Filter by draft, placed, confirmed, processing, fulfilled, or cancelled",
		)
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.orders.list({
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No orders.");
				for (const order of data.items)
					line(
						`${order.id}  ${order.number}  [${order.status}]  ${(order.totalCents / 100).toFixed(2)} ${order.currency}  ${order.clientName}`,
					);
			},
		);

	orders
		.command("get <id>")
		.description("Show one order with its purchased lines")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.orders.get(id);
			if (options.json) return printJson(data);
			line(`${data.number}  (${data.id})`);
			line(`  status: ${data.status}`);
			line(`  client: ${data.clientName}`);
			line(`  total:  ${(data.totalCents / 100).toFixed(2)} ${data.currency}`);
			for (const item of data.lineItems ?? [])
				line(
					`    ${item.quantity} x ${item.name}  ${(item.unitPriceCents / 100).toFixed(2)} ${data.currency}`,
				);
		});

	orders
		.command("create")
		.description("Create a single-line order")
		.requiredOption("--client <id>", "Client id")
		.requiredOption("--name <text>", "Purchased item name")
		.requiredOption("--price-cents <cents>", "Unit price in integer cents")
		.option("--quantity <quantity>", "Quantity", "1")
		.option(
			"--type <type>",
			"physical, digital, service, or rental",
			"physical",
		)
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				client: string;
				name: string;
				priceCents: string;
				quantity: string;
				type: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.orders.create(
					{
						clientId: options.client,
						lines: [
							{
								name: options.name,
								type: options.type as never,
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

	orders
		.command("status <id> <status>")
		.description(
			"Move an order between draft, placed, confirmed, processing, fulfilled, and cancelled",
		)
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.orders.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`${data.number} is now ${data.status}`);
			},
		);
}
