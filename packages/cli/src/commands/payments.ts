import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerPaymentCommands(program: Command): void {
	const payments = program
		.command("payments")
		.description("Manage the workspace's payments");

	payments
		.command("list")
		.description("List payments")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--status <status>", "Filter by status (pending, succeeded, …)")
		.action(
			async (options: { json?: boolean; limit: string; status?: string }) => {
				const { data } = await buildClient().client.payments.list({
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No payments.");
				for (const payment of data.items)
					line(
						`${payment.id}  [${payment.status}]  ${(payment.amountCents / 100).toFixed(2)} ${payment.currency}`,
					);
			},
		);

	payments
		.command("get <id>")
		.description("Show one payment with its refunds")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.payments.get(id);
			if (options.json) return printJson(data);
			line(`${data.id}`);
			line(`  status:   ${data.status}`);
			line(
				`  amount:   ${(data.amountCents / 100).toFixed(2)} ${data.currency}`,
			);
			for (const refund of data.refunds ?? [])
				line(
					`    refund ${(refund.amountCents / 100).toFixed(2)} ${data.currency}`,
				);
		});

	payments
		.command("record")
		.description("Record a payment")
		.requiredOption("--amount-cents <cents>", "Amount in integer cents")
		.option("--invoice <id>", "Invoice id this payment applies to")
		.option("--status <status>", "pending, processing, succeeded, or failed")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				amountCents: string;
				invoice?: string;
				status?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.payments.record(
					{
						amountCents: Number(options.amountCents),
						invoiceId: options.invoice ?? null,
						status: options.status as never,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Recorded payment ${data.id} (${data.status})`);
			},
		);
}
