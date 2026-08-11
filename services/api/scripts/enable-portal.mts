/**
 * Publish a workspace's customer portal.
 *
 * Bootstrap resolves a workspace from its slug and refuses anything not
 * explicitly published, so a workspace with no `workspace_branding` row 404s at
 * every portal address. This creates that row.
 *
 *   pnpm portal:enable                 # the first (or only) workspace
 *   pnpm portal:enable <workspaceId>
 *   pnpm portal:enable <workspaceId> --slug my-shop
 *
 * A stand-in until Connect owns this. It is idempotent: run it again to mint a
 * fresh key or move the slug, and the existing row is updated rather than
 * duplicated.
 *
 * ⚠️ Writes to whatever `DATABASE_URL` points at. To publish a PRODUCTION
 * portal, point it at Neon for the one command — the portal at
 * `portal.quickdash.xyz` reads the live database, not your Docker one.
 */
import {
	issueApiKey,
	PUBLISHABLE_CAPABILITIES,
} from "@quickengine/auth/api-keys";
import { availablePortalSlug, db, eq } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { workspaceBranding } from "@quickengine/db/schema/workspace-branding";

const args = process.argv.slice(2);
const requested = args.find((arg) => !arg.startsWith("--"));
const slugFlagIndex = args.indexOf("--slug");
const requestedSlug =
	slugFlagIndex >= 0 ? args[slugFlagIndex + 1]?.toLowerCase() : undefined;

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

const [existing] = await db
	.select({
		id: workspaceBranding.id,
		portalSlug: workspaceBranding.portalSlug,
	})
	.from(workspaceBranding)
	.where(eq(workspaceBranding.workspaceId, workspace.id))
	.limit(1);

// Keep the slug already published unless a new one was asked for. A portal's
// URL is something a business hands to its customers; silently moving it on a
// re-run would break every link they had shared.
const slug =
	requestedSlug ??
	existing?.portalSlug ??
	(await availablePortalSlug(workspace.name, {
		excludeWorkspaceId: workspace.id,
	}));

// Publishable, never secret. `issueApiKey` clamps capabilities by type, so this
// cannot be handed anything that moves money even by mistake.
const key = await issueApiKey({
	workspaceId: workspace.id,
	createdByUserId: workspace.ownerId,
	name: "Customer portal",
	type: "publishable",
	capabilities: PUBLISHABLE_CAPABILITIES,
});

if (existing) {
	await db
		.update(workspaceBranding)
		.set({
			portalSlug: slug,
			portalPublishableKey: key.plaintext,
			portalEnabled: true,
			updatedAt: new Date(),
		})
		.where(eq(workspaceBranding.id, existing.id));
} else {
	await db.insert(workspaceBranding).values({
		workspaceId: workspace.id,
		portalSlug: slug,
		portalPublishableKey: key.plaintext,
		portalEnabled: true,
	});
}

const host = process.env.CUSTOMER_PORTAL_URL ?? "http://localhost:3012";

console.log(`\n✅ ${workspace.name}  (${workspace.id})`);
console.log(`   ${existing ? "updated" : "published"}  slug: ${slug}\n`);
console.log(`   Portal:  ${host.replace(/\/$/, "")}/${slug}\n`);
console.log("Support email and logo are still unset — mail falls back to the");
console.log("platform address until Connect can set them.\n");

process.exit(0);
