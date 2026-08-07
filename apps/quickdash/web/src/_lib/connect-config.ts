/**
 * What a connected site needs, generated in one place.
 *
 * 🔴 A PURE FUNCTION on purpose. Today the Connect page renders this. When
 * connected repositories ship (8L-c), the GitHub App opens a pull request adding
 * "the SDK dependency, the environment variable, and one working example call" —
 * and it must add EXACTLY what this page told the user, or the two paths drift
 * and the bot starts writing something the docs never mentioned.
 *
 * So: no React, no fetching, no `clientEnv` import. Everything comes in as an
 * argument and a string comes out.
 */

export type ConnectTarget = "selling-storefront" | "public-site" | "backend";

export type ConnectConfigInput = {
	target: ConnectTarget;
	apiUrl: string;
	workspaceId: string;
	/** The plaintext key, or null before one has been issued. */
	key: string | null;
	/** Origin of the hosted portal, or null when it has none / is unconfigured. */
	portalUrl?: string | null;
	/** The workspace's portal slug, or null when no portal is published. */
	portalSlug?: string | null;
};

/** The placeholder shown before a key exists, so the block is readable early. */
const KEY_PLACEHOLDER = "…create the key below";

/**
 * Framework-neutral `NEXT_PUBLIC_` naming.
 *
 * ⚠️ These exact names are what the proven Gemsutopia integration reads, so they
 * are a contract, not a preference. A site on Vite or Nuxt renames the prefix;
 * the suffix must match what its own code looks for.
 */
export function browserEnvBlock(input: ConnectConfigInput): string {
	const lines = [
		`NEXT_PUBLIC_QUICKDASH_API_URL=${input.apiUrl}`,
		`NEXT_PUBLIC_QUICKDASH_WORKSPACE_ID=${input.workspaceId}`,
		`NEXT_PUBLIC_QUICKDASH_SITE_KEY=${input.key ?? KEY_PLACEHOLDER}`,
	];
	// Only when there is genuinely somewhere to send people. A guessed portal
	// hostname in somebody's .env is worse than no line at all.
	if (input.portalUrl && input.portalSlug) {
		lines.push(
			`NEXT_PUBLIC_QUICKDASH_PORTAL_URL=${input.portalUrl}`,
			`NEXT_PUBLIC_QUICKDASH_PORTAL_SLUG=${input.portalSlug}`,
		);
	}
	return lines.join("\n");
}

/** A server key never belongs in a browser bundle, so it gets unprefixed names. */
export function serverEnvBlock(input: ConnectConfigInput): string {
	return [
		`QUICKDASH_API_URL=${input.apiUrl}`,
		`QUICKDASH_WORKSPACE_ID=${input.workspaceId}`,
		`QUICKDASH_API_KEY=${input.key ?? KEY_PLACEHOLDER}`,
	].join("\n");
}

export function envBlock(input: ConnectConfigInput): string {
	return input.target === "backend"
		? serverEnvBlock(input)
		: browserEnvBlock(input);
}

export function installLine(): string {
	return "npm install @quickengine/quick";
}

/**
 * One call that proves the connection, chosen to be the smallest honest read.
 *
 * The browser example imports from `@quickengine/quick/browser`, never the
 * package root — the root pulls in webhook signature verification, which needs
 * Node's `crypto` and has no business in a bundle.
 */
export function exampleCall(input: ConnectConfigInput): string {
	if (input.target === "backend") {
		return `import { createQuickServer } from "@quickengine/quick";

const quick = createQuickServer({
  baseUrl: process.env.QUICKDASH_API_URL!,
  workspaceId: process.env.QUICKDASH_WORKSPACE_ID!,
  credential: { type: "scoped", token: process.env.QUICKDASH_API_KEY! },
});

const { data } = await quick.clients.list({ limit: 10 });`;
	}

	return `import { createQuickConnect } from "@quickengine/quick/browser";

export const quick = createQuickConnect({
  baseUrl: process.env.NEXT_PUBLIC_QUICKDASH_API_URL!,
  workspaceId: process.env.NEXT_PUBLIC_QUICKDASH_WORKSPACE_ID!,
  credential: { type: "site", key: process.env.NEXT_PUBLIC_QUICKDASH_SITE_KEY! },
});

const { data } = await quick.catalog.list({ limit: 10 });`;
}

/** What the key is called in the list afterwards, so it is recognisable. */
export function suggestedKeyName(target: ConnectTarget): string {
	if (target === "backend") return "Trusted backend";
	return target === "public-site" ? "Public website" : "Storefront";
}
