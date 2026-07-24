import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

type PricedItem = {
	priceCents: number | null;
	currency: string;
	pricingModel: string;
};

function formatPrice(item: PricedItem): string {
	if (item.priceCents == null) return item.pricingModel;
	return `${(item.priceCents / 100).toFixed(2)} ${item.currency}`;
}

export function registerCatalogCommands(program: Command): void {
	const catalog = program
		.command("catalog")
		.description("Manage the workspace's catalog of products and services");

	catalog
		.command("list")
		.description("List catalog items")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--status <status>", "Filter by draft, active, or archived")
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.catalog.list({
					limit: Number(options.limit),
					status: options.status as "draft" | "active" | "archived" | undefined,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No catalog items.");
				for (const item of data.items)
					line(
						`${item.id}  ${item.name}  [${item.type}/${item.status}]  ${formatPrice(item)}`,
					);
			},
		);

	catalog
		.command("get <id>")
		.description("Show one catalog item with its variants")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { client } = buildClient();
			const { data } = await client.catalog.get(id);
			const variants = await client.catalog.listVariants(id);
			if (options.json) return printJson({ ...data, variants: variants.data });
			line(`${data.name}  (${data.id})`);
			line(`  type:   ${data.type}`);
			line(`  status: ${data.status}`);
			line(`  price:  ${formatPrice(data)}`);
			if (data.description) line(`  ${data.description}`);
			if (variants.data.length > 0) {
				line("  variants:");
				for (const variant of variants.data) {
					const opts = variant.options
						.map((option) => `${option.name}=${option.value}`)
						.join(", ");
					line(
						`    ${variant.id}  ${opts}${variant.sku ? `  (${variant.sku})` : ""}`,
					);
				}
			}
		});

	catalog
		.command("create")
		.description("Create a catalog item")
		.requiredOption("--name <name>", "Item name")
		.requiredOption(
			"--type <type>",
			"physical, digital, service, package, or rental",
		)
		.option(
			"--pricing-model <model>",
			"fixed, starting_at, hourly, custom_quote, or free",
		)
		.option("--price-cents <cents>", "Price in integer cents")
		.option("--sku <sku>", "Stock keeping unit")
		.option("--currency <currency>", "ISO currency code")
		.option("--description <text>", "Description")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				name: string;
				type: string;
				pricingModel?: string;
				priceCents?: string;
				sku?: string;
				currency?: string;
				description?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.catalog.create(
					{
						name: options.name,
						type: options.type as
							| "physical"
							| "digital"
							| "service"
							| "package"
							| "rental",
						pricingModel: options.pricingModel as
							| "fixed"
							| "starting_at"
							| "hourly"
							| "custom_quote"
							| "free"
							| undefined,
						priceCents:
							options.priceCents != null
								? Number(options.priceCents)
								: undefined,
						sku: options.sku,
						currency: options.currency,
						description: options.description,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created ${data.name} (${data.id})`);
			},
		);
}
