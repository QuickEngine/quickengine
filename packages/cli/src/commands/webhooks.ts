import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

const status = (delivery: { status: string; responseStatus: number | null }) =>
	delivery.responseStatus
		? `${delivery.status} (${delivery.responseStatus})`
		: delivery.status;

export function registerWebhookCommands(program: Command): void {
	const webhooks = program
		.command("webhooks")
		.description("Manage outbound webhook endpoints and inspect deliveries");

	webhooks
		.command("list")
		.description("List this workspace's webhook endpoints")
		.option("--json", "Output JSON")
		.action(async (options: { json?: boolean }) => {
			const { data } = await buildClient().client.webhooks.list();
			if (options.json) return printJson(data);
			if (!data.length) return line("No webhook endpoints yet.");
			for (const endpoint of data) {
				const events = endpoint.eventTypes.length
					? endpoint.eventTypes.join(", ")
					: "all events";
				line(`  ${endpoint.enabled ? "●" : "○"} ${endpoint.url}  ${events}`);
				line(`     ${endpoint.id}`);
				if (endpoint.disabledReason) line(`     ${endpoint.disabledReason}`);
			}
		});

	webhooks
		.command("create <url>")
		.description("Register a webhook endpoint")
		.option("--events <names...>", "Only these events (default: all)")
		.option("--description <text>", "What this endpoint is for")
		.option("--json", "Output JSON")
		.action(
			async (
				url: string,
				options: { events?: string[]; description?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.webhooks.create({
					url,
					eventTypes: options.events ?? [],
					description: options.description,
				});
				if (options.json) return printJson(data);
				line(`Created ${data.id}`);
				line("");
				// The one and only time this value is available.
				line(`  Signing secret: ${data.secret}`);
				line("  Store it now — it cannot be retrieved again.");
			},
		);

	webhooks
		.command("delete <id>")
		.description("Delete a webhook endpoint and its delivery history")
		.action(async (id: string) => {
			await buildClient().client.webhooks.delete(id);
			line(`Deleted ${id}`);
		});

	webhooks
		.command("disable <id>")
		.description("Stop delivering to an endpoint without deleting it")
		.action(async (id: string) => {
			await buildClient().client.webhooks.update(id, { enabled: false });
			line(`Disabled ${id}`);
		});

	webhooks
		.command("enable <id>")
		.description("Resume delivering to an endpoint")
		.action(async (id: string) => {
			await buildClient().client.webhooks.update(id, { enabled: true });
			line(`Enabled ${id}`);
		});

	webhooks
		.command("deliveries <endpointId>")
		.description("Recent deliveries for an endpoint, newest first")
		.option("--limit <n>", "How many to show (max 100)")
		.option("--json", "Output JSON")
		.action(
			async (
				endpointId: string,
				options: { limit?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.webhooks.deliveries(
					endpointId,
					{ limit: options.limit ? Number(options.limit) : undefined },
				);
				if (options.json) return printJson(data);
				if (!data.length) return line("No deliveries yet.");
				for (const delivery of data) {
					line(
						`  ${delivery.createdAt}  ${delivery.eventName}  ${status(delivery)}  attempts ${delivery.attempts}`,
					);
					if (delivery.error) line(`     ${delivery.error}`);
				}
			},
		);

	webhooks
		.command("replay <deliveryId>")
		.description("Attempt a delivery again")
		.action(async (deliveryId: string) => {
			await buildClient().client.webhooks.replay(deliveryId);
			line(`Queued ${deliveryId} for another attempt.`);
		});
}
