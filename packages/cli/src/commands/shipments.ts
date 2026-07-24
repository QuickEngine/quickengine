import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerShipmentCommands(program: Command): void {
	const shipments = program
		.command("shipments")
		.description("Manage the workspace's shipments");

	shipments
		.command("list")
		.description("List shipments")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--order <id>", "Only shipments for this order")
		.option(
			"--status <status>",
			"Filter by draft, ready, shipped, in_transit, delivered, exception, or cancelled",
		)
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				order?: string;
				status?: string;
			}) => {
				const { data } = await buildClient().client.shipments.list({
					limit: Number(options.limit),
					orderId: options.order,
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No shipments.");
				for (const item of data.items)
					line(
						`${item.id}  [${item.status}]  ${item.carrier ?? "no carrier"}  ${item.trackingNumber ?? "no tracking"}`,
					);
			},
		);

	shipments
		.command("get <id>")
		.description("Show one shipment with its lines and parcels")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.shipments.get(id);
			if (options.json) return printJson(data);
			line(`${data.id}`);
			line(`  status:   ${data.status}`);
			line(`  order:    ${data.orderId}`);
			line(
				`  to:       ${data.destination.recipientName}, ${data.destination.city}`,
			);
			line(`  carrier:  ${data.carrier ?? "not set"}`);
			line(`  tracking: ${data.trackingNumber ?? "not set"}`);
			for (const parcel of data.parcels ?? [])
				line(`    parcel ${parcel.weightGrams}g`);
		});

	shipments
		.command("status <id> <status>")
		.description(
			"Move a shipment between draft, ready, shipped, in_transit, delivered, exception, and cancelled",
		)
		.option("--require-tracking", "Refuse to ship without a tracking number")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: {
					requireTracking?: boolean;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.shipments.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
					{ requireTracking: options.requireTracking },
				);
				if (options.json) return printJson(data);
				line(`Shipment ${data.id} is now ${data.status}`);
			},
		);

	shipments
		.command("track <id>")
		.description("Set or correct carrier tracking details")
		.option("--carrier <name>", "Carrier name")
		.option("--service <level>", "Service level")
		.option("--number <tracking>", "Tracking number")
		.option("--url <url>", "Tracking URL")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				options: {
					carrier?: string;
					service?: string;
					number?: string;
					url?: string;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.shipments.updateTracking(
					id,
					{
						carrier: options.carrier ?? null,
						serviceLevel: options.service ?? null,
						trackingNumber: options.number ?? null,
						trackingUrl: options.url ?? null,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(
					`Tracking for ${data.id}: ${data.carrier ?? "no carrier"} ${data.trackingNumber ?? ""}`,
				);
			},
		);
}
