import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerContractCommands(program: Command): void {
	const contracts = program
		.command("contracts")
		.description("Manage the workspace's contracts and e-signatures");

	contracts
		.command("list")
		.description("List contracts")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--client <id>", "Only this client")
		.option(
			"--status <status>",
			"draft, sent, partially_signed, completed, declined, expired, voided, or superseded",
		)
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				client?: string;
				status?: string;
			}) => {
				const { data } = await buildClient().client.contracts.list({
					limit: Number(options.limit),
					clientId: options.client,
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No contracts.");
				for (const item of data.items)
					line(`${item.id}  ${item.number}  [${item.status}]  ${item.title}`);
			},
		);

	contracts
		.command("get <id>")
		.description("Show one contract with its signers")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.contracts.get(id);
			if (options.json) return printJson(data);
			line(`${data.number}  ${data.title}  (${data.id})`);
			line(`  status: ${data.status}`);
			line(`  client: ${data.clientName}`);
			for (const signer of data.signers ?? [])
				line(
					`    ${signer.position}. ${signer.name} <${signer.email}>  [${signer.status}]`,
				);
		});

	contracts
		.command("create")
		.description("Create a draft contract")
		.requiredOption("--title <text>", "Contract title")
		.option("--client <id>", "Client id")
		.option("--version <id>", "File version id of the document to sign")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				title: string;
				client?: string;
				version?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.contracts.create(
					{
						title: options.title,
						clientId: options.client ?? null,
						fileVersionId: options.version ?? null,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created ${data.number} (${data.id})`);
			},
		);

	contracts
		.command("send <id>")
		.description("Send a contract for signature")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.contracts.send(
					id,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Sent ${data.number} to ${data.invitations.length} signer(s):`);
				for (const invitation of data.invitations)
					line(`  ${invitation.name} <${invitation.email}>`);
				// Signing links are delivered out of band and never printed here.
				line("Signing links are emailed to each signer, not shown here.");
			},
		);

	contracts
		.command("void <id>")
		.description("Void a contract")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.contracts.void(
					id,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`${data.number} is now ${data.status}`);
			},
		);

	contracts
		.command("revise <id>")
		.description("Supersede a contract with a new revision")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.contracts.revise(
					id,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created revision ${data.number} (${data.id})`);
			},
		);
}
