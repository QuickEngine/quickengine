import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

const size = (bytes: number) =>
	bytes < 1024
		? `${bytes}B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(1)}KB`
			: `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export function registerFileCommands(program: Command): void {
	const files = program
		.command("files")
		.description("Manage the workspace's folders and documents");

	files
		.command("folders")
		.description("List folders")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--parent <id>", "Only folders inside this one")
		.option("--root", "Only top-level folders")
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				parent?: string;
				root?: boolean;
			}) => {
				const { data } = await buildClient().client.files.listFolders({
					limit: Number(options.limit),
					parentId: options.parent,
					rootOnly: options.root,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No folders.");
				for (const folder of data.items)
					line(`${folder.id}  ${folder.parentId ? "└ " : ""}${folder.name}`);
			},
		);

	files
		.command("new-folder <name>")
		.description("Create a folder")
		.option("--parent <id>", "Parent folder id")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				name: string,
				options: {
					parent?: string;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.files.createFolder(
					{ name, parentId: options.parent ?? null },
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created folder ${data.name} (${data.id})`);
			},
		);

	files
		.command("list")
		.description("List documents")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option("--folder <id>", "Only documents in this folder")
		.option("--status <status>", "active, archived, trashed, or deleting")
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				folder?: string;
				status?: string;
			}) => {
				const { data } = await buildClient().client.files.list({
					limit: Number(options.limit),
					folderId: options.folder,
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No documents.");
				for (const doc of data.items)
					line(
						`${doc.id}  [${doc.status}]  v${doc.currentVersionNumber ?? "-"}  ${doc.title}`,
					);
			},
		);

	files
		.command("get <id>")
		.description("Show one document with its version history")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.files.get(id);
			if (options.json) return printJson(data);
			line(`${data.title}  (${data.id})`);
			line(`  status:  ${data.status}`);
			line(`  current: v${data.currentVersionNumber ?? "none"}`);
			for (const version of data.versions ?? [])
				line(
					`    v${version.versionNumber}  [${version.status}]  ${version.originalName}  ${size(version.sizeBytes)}`,
				);
		});

	files
		.command("status <id> <status>")
		.description(
			"Move a document between active, archived, trashed, and deleting (trash before deleting)",
		)
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.files.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`${data.title} is now ${data.status}`);
			},
		);

	files
		.command("release <versionId>")
		.description("Release a quarantined version for use")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				versionId: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.files.releaseVersion(
					versionId,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Version v${data.versionNumber} is now ${data.status}`);
			},
		);
}
