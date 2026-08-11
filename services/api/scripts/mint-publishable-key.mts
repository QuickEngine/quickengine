/**
 * Mint a publishable key for the customer portal, locally.
 *
 * The portal needs one to answer "which workspace is this?", and there is no UI
 * for issuing keys yet — Connect covers that in a later slice. Until then this
 * is the bridge.
 *
 *   pnpm customer:key              # the first (or only) workspace
 *   pnpm customer:key <workspaceId>
 *
 * Prints an env line to paste into `.env.local`. Publishable keys are designed
 * to be public — they end up in page source — so printing one is not a leak.
 * A SECRET key would be, which is why this can only issue the other kind.
 */
import {
	issueApiKey,
	PUBLISHABLE_CAPABILITIES,
} from "@quickengine/auth/api-keys";
import { db } from "@quickengine/db/client";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";

const requested = process.argv[2];

const workspaces = await db
	.select({
		id: quickengineWorkspaces.id,
		name: quickengineWorkspaces.name,
		ownerId: quickengineWorkspaces.ownerId,
	})
	.from(quickengineWorkspaces)
	.limit(25);

if (workspaces.length === 0) {
	console.error(
		"✗ No workspaces exist yet. Sign up and finish onboarding first.",
	);
	process.exit(1);
}

const workspace = requested
	? workspaces.find((candidate) => candidate.id === requested)
	: workspaces[0];

if (!workspace) {
	console.error(`✗ No workspace ${requested}. Available:`);
	for (const candidate of workspaces) {
		console.error(`   ${candidate.id}  ${candidate.name}`);
	}
	process.exit(1);
}

const key = await issueApiKey({
	workspaceId: workspace.id,
	createdByUserId: workspace.ownerId,
	name: "Customer portal (local)",
	type: "publishable",
	capabilities: PUBLISHABLE_CAPABILITIES,
});

console.log(`\n✅ ${workspace.name}  (${workspace.id})\n`);
console.log("Paste into .env.local:\n");
console.log(`VITE_CUSTOMER_PUBLISHABLE_KEY=${key.plaintext}\n`);
console.log(`Then open: http://localhost:3012/?workspace=${workspace.id}\n`);

process.exit(0);
