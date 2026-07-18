import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { QuickClient, QuickCredential } from "@quickengine/quick";
import { createQuick } from "@quickengine/quick";

export type QuickConfig = {
	baseUrl: string;
	workspaceId: string;
	key: string;
};

export const CONFIG_DIR = join(homedir(), ".quick");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/**
 * Infer the credential category from a key's prefix — the same qpk_/qsk_/qsc_ prefixes the
 * key service issues. Publishable keys ride in their own header; secret and scoped are
 * bearer tokens. The CLI runs on a trusted machine, so any category is acceptable here.
 */
export function credentialFromKey(key: string): QuickCredential {
	if (key.startsWith("qpk_")) return { type: "publishable", key };
	if (key.startsWith("qsk_")) return { type: "secret", token: key };
	if (key.startsWith("qsc_")) return { type: "scoped", token: key };
	throw new Error(
		"Unrecognized key format. Expected a key starting with qpk_, qsk_, or qsc_.",
	);
}

function readConfigFile(): Partial<QuickConfig> {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return {};
		return parsed as Partial<QuickConfig>;
	} catch {
		return {};
	}
}

/**
 * Resolve config with environment variables winning over the on-disk file, so CI and
 * one-off runs need no written config. Returns a partial so callers can report exactly
 * what's missing.
 */
export function resolveConfig(
	env: NodeJS.ProcessEnv = process.env,
): Partial<QuickConfig> {
	const file = readConfigFile();
	return {
		baseUrl: env.QUICK_BASE_URL ?? file.baseUrl,
		workspaceId: env.QUICK_WORKSPACE ?? file.workspaceId,
		key: env.QUICK_KEY ?? file.key,
	};
}

function prune(patch: Partial<QuickConfig>): Partial<QuickConfig> {
	return Object.fromEntries(
		Object.entries(patch).filter(
			([, value]) => value !== undefined && value !== "",
		),
	);
}

/** Persist config with owner-only permissions — the key is a secret. */
export function writeConfigFile(
	patch: Partial<QuickConfig>,
): Partial<QuickConfig> {
	const next = { ...readConfigFile(), ...prune(patch) };
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, {
		mode: 0o600,
	});
	return next;
}

export class MissingConfigError extends Error {
	constructor(public readonly missing: string[]) {
		super(
			`Missing configuration: ${missing.join(
				", ",
			)}. Run \`quick config set\`, or set QUICK_BASE_URL / QUICK_WORKSPACE / QUICK_KEY.`,
		);
		this.name = "MissingConfigError";
	}
}

/**
 * Build a workspace-scoped Quick.js client from resolved config, or throw a clear error
 * naming exactly what's missing or malformed.
 */
export function buildClient(env?: NodeJS.ProcessEnv): {
	client: QuickClient;
	config: QuickConfig;
} {
	const config = resolveConfig(env);
	const missing: string[] = [];
	if (!config.baseUrl) missing.push("baseUrl");
	if (!config.workspaceId) missing.push("workspaceId");
	if (!config.key) missing.push("key");
	if (missing.length > 0) throw new MissingConfigError(missing);

	const resolved = config as QuickConfig;
	const client = createQuick({
		baseUrl: resolved.baseUrl,
		workspaceId: resolved.workspaceId,
		credential: credentialFromKey(resolved.key),
	});
	return { client, config: resolved };
}

/** Mask a secret for display: keep the recognizable prefix, hide the rest. */
export function maskKey(key: string): string {
	const [prefix] = key.split("_");
	return `${prefix}_${"•".repeat(8)}`;
}
