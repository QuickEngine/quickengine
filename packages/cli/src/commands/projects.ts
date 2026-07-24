import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

export function registerProjectCommands(program: Command): void {
	const projects = program
		.command("projects")
		.description("Manage the workspace's projects, milestones, and tasks");

	projects
		.command("list")
		.description("List projects")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option(
			"--status <status>",
			"Filter by draft, active, on_hold, completed, or cancelled",
		)
		.option("--include-archived", "Include archived projects")
		.action(
			async (options: {
				json?: boolean;
				limit: string;
				status?: string;
				includeArchived?: boolean;
			}) => {
				const { data } = await buildClient().client.projects.list({
					limit: Number(options.limit),
					status: options.status as never,
					includeArchived: options.includeArchived,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No projects.");
				for (const item of data.items)
					line(
						`${item.id}  [${item.status}]${item.archivedAt ? " (archived)" : ""}  ${item.name}`,
					);
			},
		);

	projects
		.command("get <id>")
		.description("Show one project")
		.option("--json", "Output JSON")
		.action(async (id: string, options: { json?: boolean }) => {
			const { data } = await buildClient().client.projects.get(id);
			if (options.json) return printJson(data);
			line(`${data.name}  (${data.id})`);
			line(`  status: ${data.status}${data.archivedAt ? "  (archived)" : ""}`);
			if (data.dueDate) line(`  due:    ${data.dueDate}`);
		});

	projects
		.command("create")
		.description("Create a project")
		.requiredOption("--name <text>", "Project name")
		.option("--client <id>", "Client id")
		.option("--due <date>", "Due date (YYYY-MM-DD)")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (options: {
				name: string;
				client?: string;
				due?: string;
				idempotencyKey?: string;
				json?: boolean;
			}) => {
				const { data } = await buildClient().client.projects.create(
					{
						name: options.name,
						clientId: options.client ?? null,
						dueDate: options.due ?? null,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created ${data.name} (${data.id})`);
			},
		);

	projects
		.command("status <id> <status>")
		.description(
			"Move a project between draft, active, on_hold, completed, and cancelled",
		)
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.projects.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`${data.name} is now ${data.status}`);
			},
		);

	projects
		.command("tasks <projectId>")
		.description("List a project's tasks")
		.option("--json", "Output JSON")
		.option("--limit <number>", "Page size", "25")
		.option(
			"--status <status>",
			"Filter by todo, in_progress, blocked, completed, or cancelled",
		)
		.action(
			async (
				projectId: string,
				options: { json?: boolean; limit: string; status?: string },
			) => {
				const { data } = await buildClient().client.projects.tasks.list({
					projectId,
					limit: Number(options.limit),
					status: options.status as never,
				});
				if (options.json) return printJson(data);
				if (!data.items.length) return line("No tasks.");
				for (const task of data.items)
					line(
						`${task.id}  [${task.status}]  ${task.priority}  ${task.parentTaskId ? "└ " : ""}${task.title}`,
					);
			},
		);

	projects
		.command("add-task <projectId> <title>")
		.description("Add a task to a project")
		.option("--milestone <id>", "Milestone id")
		.option("--parent <id>", "Parent task id (same project and milestone)")
		.option("--priority <level>", "low, normal, high, or urgent", "normal")
		.option("--due <date>", "Due date (YYYY-MM-DD)")
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				projectId: string,
				title: string,
				options: {
					milestone?: string;
					parent?: string;
					priority: string;
					due?: string;
					idempotencyKey?: string;
					json?: boolean;
				},
			) => {
				const { data } = await buildClient().client.projects.tasks.create(
					{
						projectId,
						title,
						milestoneId: options.milestone ?? null,
						parentTaskId: options.parent ?? null,
						priority: options.priority as never,
						dueDate: options.due ?? null,
					},
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`Created task ${data.title} (${data.id})`);
			},
		);

	projects
		.command("task-status <id> <status>")
		.description(
			"Move a task between todo, in_progress, blocked, completed, and cancelled",
		)
		.option("--idempotency-key <key>", "Stable retry key")
		.option("--json", "Output JSON")
		.action(
			async (
				id: string,
				status: string,
				options: { idempotencyKey?: string; json?: boolean },
			) => {
				const { data } = await buildClient().client.projects.tasks.setStatus(
					id,
					status as never,
					options.idempotencyKey ?? randomUUID(),
				);
				if (options.json) return printJson(data);
				line(`${data.title} is now ${data.status}`);
			},
		);
}
