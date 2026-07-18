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
		.description("Read the workspace's published catalog");

	catalog
		.command("list")
		.description("List active catalog items")
		.option("--json", "Output JSON")
		.action(async (options: { json?: boolean }) => {
			const { client } = buildClient();
			const { data } = await client.catalog.list();
			if (options.json) {
				printJson(data);
				return;
			}
			if (data.length === 0) {
				line("No active catalog items.");
				return;
			}
			for (const item of data) {
				line(`${item.id}  ${item.name}  [${item.type}]  ${formatPrice(item)}`);
			}
		});

	catalog
		.command("get <id>")
		.description("Show one active catalog item with its variants")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { client } = buildClient();
			const { data } = await client.catalog.get(id);
			if (options.json) {
				printJson(data);
				return;
			}
			line(`${data.name}  (${data.id})`);
			line(`  type:  ${data.type}`);
			line(`  price: ${formatPrice(data)}`);
			if (data.description) line(`  ${data.description}`);
			if (data.variants.length > 0) {
				line("  variants:");
				for (const variant of data.variants) {
					const opts = variant.options
						.map((option) => `${option.name}=${option.value}`)
						.join(", ");
					line(
						`    ${variant.id}  ${opts}${variant.sku ? `  (${variant.sku})` : ""}`,
					);
				}
			}
		});
}
