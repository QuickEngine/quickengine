import { QuickApiError } from "@quickengine/quick";
import type { Command } from "commander";
import { buildClient, credentialFromKey, resolveConfig } from "../config";
import { line } from "../output";

function check(label: string, passed: boolean, detail?: string): boolean {
	line(`${passed ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
	return passed;
}

export function registerDoctorCommand(program: Command): void {
	program
		.command("doctor")
		.description("Check configuration and connectivity")
		.action(async () => {
			const config = resolveConfig();
			let ok = true;

			ok = check("base URL set", Boolean(config.baseUrl)) && ok;
			ok = check("workspace set", Boolean(config.workspaceId)) && ok;
			ok = check("key set", Boolean(config.key)) && ok;

			if (config.key) {
				try {
					const credential = credentialFromKey(config.key);
					check(`key format (${credential.type})`, true);
				} catch (error) {
					ok = false;
					check(
						"key format",
						false,
						error instanceof Error ? error.message : undefined,
					);
				}
			}

			if (config.baseUrl && config.workspaceId && config.key) {
				try {
					const { client } = buildClient();
					const { data } = await client.catalog.list();
					check(
						`API reachable — read ${data.items.length} catalog item(s)`,
						true,
					);
				} catch (error) {
					ok = false;
					if (error instanceof QuickApiError) {
						check(
							"API reachable",
							false,
							`${error.code} (HTTP ${error.status})`,
						);
					} else {
						check(
							"API reachable",
							false,
							error instanceof Error ? error.message : "unknown error",
						);
					}
				}
			}

			line("");
			line(ok ? "All checks passed." : "Some checks failed — see above.");
			if (!ok) process.exitCode = 1;
		});
}
