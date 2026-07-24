import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerInventoryCommands(program: Command): void {
	const inventory = program
		.command("inventory")
		.description("Manage the workspace's stock");

	inventory
		.command("list")
		.description("List tracked stock records")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--status <status>", "Filter by active or archived")
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.inventory.list({
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No stock records.");
				for (const item of data.items) {
					const low = item.onHand <= item.lowStockThreshold ? "  ⚠ low" : "";
					line(
						`${item.id}  [${item.status}]  on hand ${item.onHand}  reserved ${item.reserved}${low}`,
					);
				}
			},
		);

	inventory
		.command("get <id>")
		.description("Show one stock record")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.inventory.get(id);
			if (options.json) return printJson(data);
			line(`${data.id}`);
			line(`  status:    ${data.status}`);
			line(`  on hand:   ${data.onHand}`);
			line(`  reserved:  ${data.reserved}`);
			line(`  available: ${data.onHand - data.reserved}`);
			line(`  low at:    ${data.lowStockThreshold}`);
		});

	inventory
		.command("history <id>")
		.description("Show recent stock movements, newest first")
		.option("--json", "Output JSON")
		.option("--limit <number>", "How many movements", "25")
		.action(async (id: string, options: { json?: boolean; limit: string }) => {
			const { data } = await buildClient().client.inventory.listAdjustments(
				id,
				{ limit: Number(options.limit) },
			);
			if (options.json) return printJson(data);
			if (!data.items.length) return line("No movements.");
			for (const move of data.items)
				line(
					`${move.createdAt}  ${move.kind}  ${move.quantity}  -> on hand ${move.resultingOnHand}, reserved ${move.resultingReserved}`,
				);
		});

	inventory
		.command("adjust <id> <kind> <quantity>")
		.description(
			"Record a movement: receive, sale, customer_return, damage, correction_in, correction_out, reserve, release, or fulfill_reserved",
		)
		.option("--note <text>", "Why this movement happened")
		.option("--reference <id>", "Linked record in another module")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				kind: string,
				quantity: string,
				options: {
					note?: string;
					reference?: string;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.inventory.adjust(
					id,
					{
						kind: kind as never,
						quantity: Number(quantity),
						note: options.note ?? null,
						referenceId: options.reference ?? null,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(
					`Recorded ${data.kind} ${data.quantity}: on hand ${data.resultingOnHand}, reserved ${data.resultingReserved}`,
				);
			},
		);
}
