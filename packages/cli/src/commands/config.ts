import type { Command } from "commander";
import {
	CONFIG_PATH,
	maskKey,
	resolveConfig,
	writeConfigFile,
} from "../config";
import { line, printJson } from "../output";

export function registerConfigCommands(program: Command): void {
	const config = program
		.command("config")
		.description("Manage the CLI's stored connection settings");

	config
		.command("set")
		.description("Save base URL, workspace, and/or API key")
		.option(
			"--base-url <url>",
			"Product API origin, e.g. https://dash.quickengine.xyz/api",
		)
		.option("--workspace <id>", "Workspace id to scope requests to")
		.option(
			"--key <key>",
			"An API key (qpk_/qsk_/qsc_) from Account → workspace → API keys",
		)
		.action(
			(options: { baseUrl?: string; workspace?: string; key?: string }) => {
				const saved = writeConfigFile({
					baseUrl: options.baseUrl,
					workspaceId: options.workspace,
					key: options.key,
				});
				line(`Saved to ${CONFIG_PATH}`);
				line(`  base URL:  ${saved.baseUrl ?? "(unset)"}`);
				line(`  workspace: ${saved.workspaceId ?? "(unset)"}`);
				line(`  key:       ${saved.key ? maskKey(saved.key) : "(unset)"}`);
			},
		);

	config
		.command("show")
		.description("Show the resolved settings (key masked)")
		.option("--json", "Output JSON")
		.action((options: { json?: boolean }) => {
			const resolved = resolveConfig();
			const view = {
				baseUrl: resolved.baseUrl ?? null,
				workspaceId: resolved.workspaceId ?? null,
				key: resolved.key ? maskKey(resolved.key) : null,
			};
			if (options.json) {
				printJson(view);
				return;
			}
			line(`base URL:  ${view.baseUrl ?? "(unset)"}`);
			line(`workspace: ${view.workspaceId ?? "(unset)"}`);
			line(`key:       ${view.key ?? "(unset)"}`);
		});
}
