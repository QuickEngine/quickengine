import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	outro,
	password,
	spinner,
	text,
} from "@clack/prompts";
import type { Command } from "commander";
import {
	CONFIG_PATH,
	maskKey,
	resolveConfig,
	writeConfigFile,
} from "../config";
import { DEFAULT_API_URL } from "../defaults";
import { verifyConnection } from "../verify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bail cleanly on Ctrl-C rather than writing half a config. */
function ensure<T>(value: T | symbol): T {
	if (isCancel(value)) {
		cancel("Setup cancelled — nothing was saved.");
		process.exit(0);
	}
	return value as T;
}

export function registerInitCommand(program: Command): void {
	program
		.command("init")
		.description("Set up the CLI: API URL, workspace, and key")
		.option("--force", "Reconfigure even if settings already exist")
		.action(async (options: { force?: boolean }) => {
			const existing = resolveConfig();
			intro("QuickEngine CLI setup");

			if (
				!options.force &&
				existing.baseUrl &&
				existing.workspaceId &&
				existing.key
			) {
				log.info(
					`Already configured — ${existing.workspaceId} at ${existing.baseUrl}`,
				);
				const again = ensure(
					await confirm({
						message: "Reconfigure?",
						initialValue: false,
					}),
				);
				if (!again) {
					outro("Left unchanged. Run `quick doctor` to check it still works.");
					return;
				}
			}

			const baseUrl = ensure(
				await text({
					message: "API URL",
					placeholder: DEFAULT_API_URL,
					defaultValue: existing.baseUrl ?? DEFAULT_API_URL,
					initialValue: existing.baseUrl ?? DEFAULT_API_URL,
					validate: (value) => {
						try {
							new URL(value ?? "");
						} catch {
							return "That is not a valid URL.";
						}
					},
				}),
			);

			const workspaceId = ensure(
				await text({
					message: "Workspace id",
					placeholder: "00000000-0000-4000-8000-000000000000",
					initialValue: existing.workspaceId ?? "",
					// Caught here rather than as a confusing WORKSPACE_NOT_FOUND later.
					validate: (value) =>
						UUID.test((value ?? "").trim())
							? undefined
							: "A workspace id is a UUID — copy it from Account.",
				}),
			);

			const key = ensure(
				await password({
					message: "API key",
					// Never echoed: this is a live credential, and terminals keep scrollback.
					validate: (value) =>
						/^(qpk|qsk|qsc)_/.test((value ?? "").trim())
							? undefined
							: "Keys start with qpk_, qsk_, or qsc_.",
				}),
			);

			const config = {
				baseUrl: baseUrl.trim(),
				workspaceId: workspaceId.trim(),
				key: key.trim(),
			};

			// Verify before writing, so a typo never becomes a saved setting that
			// fails on some unrelated command later.
			const checking = spinner();
			checking.start("Checking the connection");
			const result = await verifyConnection(config);
			checking.stop(
				result.ok ? `Connected — ${result.detail}` : "Could not connect",
			);

			if (!result.ok) {
				log.error(result.detail);
				const save = ensure(
					await confirm({
						message: "Save these settings anyway?",
						initialValue: false,
					}),
				);
				if (!save) {
					cancel("Nothing was saved. Run `quick init` again when ready.");
					return;
				}
			}

			writeConfigFile(config);
			log.success(`Saved to ${CONFIG_PATH} (owner-only)`);
			log.info(`workspace ${config.workspaceId} · key ${maskKey(config.key)}`);
			outro(
				"Ready. Try `quick clients list`, or run `quick` for a guided menu.",
			);
		});
}
