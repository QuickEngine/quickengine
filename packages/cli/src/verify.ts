import { QuickApiError } from "@quickengine/quick";
import { buildClient, credentialFromKey, type QuickConfig } from "./config";

/**
 * What a connection attempt actually proved.
 *
 * The distinction matters because "the request failed" and "your setup is wrong"
 * are different answers. A key that authenticates but lacks one capability has a
 * *working* connection — reporting that as unreachable sends people to check their
 * network when they should be checking their key's permissions.
 */
export type ConnectionResult =
	| { ok: true; detail: string }
	| { ok: false; reason: "key" | "workspace" | "network"; detail: string };

/**
 * Prove that a base URL, workspace, and key work together.
 *
 * Reads client records because every workspace has that module — it is one of the
 * four universal ones. But the check does not depend on the read *succeeding*: a
 * capability refusal still demonstrates the key was accepted and the workspace
 * resolved, which is the question being asked.
 */
export async function verifyConnection(
	config?: Partial<QuickConfig>,
	/** Injected in tests; production always builds a real client. */
	connect: typeof buildClient = buildClient,
): Promise<ConnectionResult> {
	try {
		if (config?.key) credentialFromKey(config.key);
	} catch (error) {
		return {
			ok: false,
			reason: "key",
			detail:
				error instanceof Error ? error.message : "unrecognized key format",
		};
	}

	try {
		const { client } = connect(
			config
				? ({
						QUICK_BASE_URL: config.baseUrl,
						QUICK_WORKSPACE: config.workspaceId,
						QUICK_KEY: config.key,
					} as NodeJS.ProcessEnv)
				: undefined,
		);
		const { data } = await client.clients.list();
		return { ok: true, detail: `read ${data.items.length} client record(s)` };
	} catch (error) {
		if (!(error instanceof QuickApiError)) {
			return {
				ok: false,
				reason: "network",
				detail: error instanceof Error ? error.message : "unknown error",
			};
		}

		switch (error.code) {
			// The key was accepted; it simply may not read clients. Connection proven.
			case "CAPABILITY_DENIED":
			case "MODULE_DISABLED":
				return {
					ok: true,
					detail: `connected (this key cannot read clients: ${error.code})`,
				};
			case "AUTHENTICATION_REQUIRED":
			case "INVALID_API_KEY":
			case "CREDENTIAL_CHANNEL_MISMATCH":
				return {
					ok: false,
					reason: "key",
					detail: `${error.code} — check the API key`,
				};
			case "WORKSPACE_NOT_FOUND":
			case "WORKSPACE_MISMATCH":
			case "WORKSPACE_REQUIRED":
				return {
					ok: false,
					reason: "workspace",
					detail: `${error.code} — check the workspace id`,
				};
			default:
				return {
					ok: false,
					reason: "network",
					detail: `${error.code} (HTTP ${error.status})`,
				};
		}
	}
}
