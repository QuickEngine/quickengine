import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	note,
	outro,
	text,
} from "@clack/prompts";
import type { Command } from "commander";
import { resolveConfig } from "../config";
import { scaffoldFiles } from "../scaffold";

/** Kept in step with the SDK the CLI itself depends on. */
const SDK_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://api.quickengine.xyz";

function ensure<T>(value: T | symbol): T {
	if (isCancel(value)) {
		cancel("Cancelled — nothing was written.");
		process.exit(0);
	}
	return value as T;
}

/** npm package naming, which is also a sane directory name. */
const NAME = /^[a-z0-9][a-z0-9._-]*$/;

export function registerCreateCommands(program: Command): void {
	const create = program
		.command("create")
		.description("Generate a new project wired to a workspace");

	create
		.command("app [name]")
		.description("A minimal app with the SDK installed and one working call")
		.option("--base-url <url>", "API URL to target")
		.option("--workspace <id>", "Workspace id to target")
		.option("--yes", "Accept defaults without prompting")
		.action(
			async (
				name: string | undefined,
				options: { baseUrl?: string; workspace?: string; yes?: boolean },
			) => {
				const existing = resolveConfig();
				intro("Create a QuickEngine app");

				const appName =
					name ??
					(options.yes
						? "quickengine-app"
						: ensure(
								await text({
									message: "Project name",
									placeholder: "my-backend",
									defaultValue: "quickengine-app",
									initialValue: "quickengine-app",
									validate: (value) =>
										NAME.test((value ?? "").trim())
											? undefined
											: "Lowercase letters, digits, dots, dashes, underscores.",
								}),
							));

				if (!NAME.test(appName)) {
					cancel(`"${appName}" is not a usable project name.`);
					process.exitCode = 1;
					return;
				}

				const directory = resolve(process.cwd(), appName);
				// Refuse to write into a directory that already has contents. Silently
				// merging into someone's existing project is not a recoverable mistake.
				if (existsSync(directory) && readdirSync(directory).length > 0) {
					cancel(`${directory} already exists and is not empty.`);
					process.exitCode = 1;
					return;
				}

				const baseUrl = options.baseUrl ?? existing.baseUrl ?? DEFAULT_BASE_URL;
				const workspaceId = options.workspace ?? existing.workspaceId ?? "";

				if (!workspaceId) {
					log.warn(
						"No workspace configured — .env will need one. Run `quick init` first to skip this.",
					);
				}

				// Offer the configured key rather than making someone fetch it again,
				// but never assume: it is a live credential landing on disk.
				let key: string | undefined;
				if (existing.key && !options.yes) {
					const reuse = ensure(
						await confirm({
							message: "Write your current API key into the project's .env?",
							initialValue: true,
						}),
					);
					if (reuse) key = existing.key;
				}

				const files = scaffoldFiles({
					name: appName,
					baseUrl,
					workspaceId,
					key,
					sdkVersion: SDK_VERSION,
				});

				mkdirSync(directory, { recursive: true });
				for (const file of files) {
					writeFileSync(join(directory, file.path), file.contents, {
						mode: file.mode,
					});
				}

				note(
					[
						`cd ${appName}`,
						"npm install",
						key
							? "npm start"
							: "# add QUICKENGINE_KEY to .env, then:\nnpm start",
					].join("\n"),
					"Next",
				);
				log.success(`Created ${files.length} files in ${appName}/`);
				outro(
					key
						? "Ready to run."
						: "Add a secret key from Account → API keys to .env, then `npm start`.",
				);
			},
		);
}
