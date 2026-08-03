// How a workspace presents itself to its own customers — resolved once, here,
// so the portal and the transactional emails cannot disagree about a business's
// name, colour or support address.
//
// Every read goes through `resolveBrand`. Nothing else decides a fallback.

import { and, eq, like, ne } from "drizzle-orm";
import { db } from "./client";
import { quickengineWorkspaces } from "./schema/quickengine";
import { workspaceBranding } from "./schema/workspace-branding";
import { nextAvailableSlug, slugify } from "./slug";

/**
 * Slugs the portal cannot hand to a workspace.
 *
 * ⚠️ The portal resolves a workspace from the FIRST path segment
 * (`portal.quickdash.xyz/<slug>`), so a workspace slugged `verify` would shadow
 * the sign-in callback and make that business's customers unable to log in.
 * Anything the portal routes on, or might route on, belongs here.
 */
export const RESERVED_PORTAL_SLUGS = new Set([
	"api",
	"assets",
	"admin",
	"auth",
	"sign-in",
	"sign-out",
	"signin",
	"signout",
	"verify",
	"static",
	"public",
	"health",
	"favicon.ico",
	"robots.txt",
	"_",
	"w",
]);

/** The brand as every customer-facing surface consumes it. */
export type ResolvedBrand = {
	workspaceId: string;
	name: string;
	supportEmail: string;
	logoUrl?: string;
	tagline?: string;
	accentColor?: string;
	websiteUrl?: string;
};

/**
 * The address used when a workspace has not set one.
 *
 * 🔴 This is the platform showing through, and it is a fallback of last resort
 * rather than a default anyone should land on. Connect nags until it is set.
 */
const PLATFORM_FALLBACK_SUPPORT_EMAIL =
	process.env.CUSTOMER_SUPPORT_EMAIL ?? "support@quickdash.xyz";

/**
 * The brand for a workspace, with every fallback applied.
 *
 * Returns null only when the workspace does not exist. A workspace with no
 * branding row is normal — it gets its own name and the platform support
 * address, which is worse than configured branding but better than a blank
 * header on a receipt.
 */
export async function resolveBrand(
	workspaceId: string,
): Promise<ResolvedBrand | null> {
	const [row] = await db
		.select({
			workspaceName: quickengineWorkspaces.name,
			displayName: workspaceBranding.displayName,
			supportEmail: workspaceBranding.supportEmail,
			logoUrl: workspaceBranding.logoUrl,
			tagline: workspaceBranding.tagline,
			accentColor: workspaceBranding.accentColor,
			websiteUrl: workspaceBranding.websiteUrl,
		})
		.from(quickengineWorkspaces)
		// LEFT join: the workspace is the subject, branding is optional. An inner
		// join would silently stop sending mail for every workspace that has not
		// opened Connect yet.
		.leftJoin(
			workspaceBranding,
			eq(workspaceBranding.workspaceId, quickengineWorkspaces.id),
		)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);

	if (!row) return null;

	return {
		workspaceId,
		name: row.displayName?.trim() || row.workspaceName,
		supportEmail: row.supportEmail?.trim() || PLATFORM_FALLBACK_SUPPORT_EMAIL,
		logoUrl: row.logoUrl ?? undefined,
		tagline: row.tagline ?? undefined,
		accentColor: row.accentColor ?? undefined,
		websiteUrl: row.websiteUrl ?? undefined,
	};
}

/** True when the workspace still leans on the platform support address. */
export function usesPlatformSupportEmail(brand: ResolvedBrand): boolean {
	return brand.supportEmail === PLATFORM_FALLBACK_SUPPORT_EMAIL;
}

/**
 * Everything the hosted portal needs to boot, by URL slug.
 *
 * Deliberately unauthenticated — it is the call that happens BEFORE a visitor
 * has any credential, and it answers "whose shop is this?". Nothing here is
 * private: a name, a logo, a colour, and a publishable key that is designed to
 * sit in page source.
 *
 * Returns null for an unknown slug AND for a workspace whose portal is off, so
 * a caller cannot tell the two apart. That keeps the endpoint from confirming
 * which businesses exist.
 */
export async function portalBootstrap(slug: string): Promise<
	| (ResolvedBrand & {
			portalSlug: string;
			publishableKey: string | null;
	  })
	| null
> {
	const [row] = await db
		.select({
			workspaceId: workspaceBranding.workspaceId,
			portalSlug: workspaceBranding.portalSlug,
			publishableKey: workspaceBranding.portalPublishableKey,
			enabled: workspaceBranding.portalEnabled,
		})
		.from(workspaceBranding)
		.where(eq(workspaceBranding.portalSlug, slug.toLowerCase()))
		.limit(1);

	if (!row?.enabled) return null;

	const brand = await resolveBrand(row.workspaceId);
	if (!brand) return null;

	return {
		...brand,
		portalSlug: row.portalSlug,
		publishableKey: row.publishableKey,
	};
}

/**
 * A free, globally unique portal slug derived from a name.
 *
 * ⚠️ Uniqueness is global, unlike `quickengine_workspaces.slug` which is unique
 * only per owner. Two owners may both name a workspace "gemsutopia"; only one
 * can own `portal.quickdash.xyz/gemsutopia`.
 *
 * The candidate set is narrowed with a prefix match rather than loading every
 * slug in the table, and the unique constraint remains the actual guarantee —
 * this only avoids losing a race on the common path.
 */
export async function availablePortalSlug(
	name: string,
	{ excludeWorkspaceId }: { excludeWorkspaceId?: string } = {},
): Promise<string> {
	const base = slugify(name);

	const rows = await db
		.select({ portalSlug: workspaceBranding.portalSlug })
		.from(workspaceBranding)
		.where(
			excludeWorkspaceId
				? and(
						like(workspaceBranding.portalSlug, `${base}%`),
						ne(workspaceBranding.workspaceId, excludeWorkspaceId),
					)
				: like(workspaceBranding.portalSlug, `${base}%`),
		);

	const taken = new Set(rows.map((row) => row.portalSlug));
	for (const reserved of RESERVED_PORTAL_SLUGS) taken.add(reserved);

	return nextAvailableSlug(base, taken);
}
