// How a workspace presents itself to its own customers — resolved once, here,
// so the portal and the transactional emails cannot disagree about a business's
// name, colour or support address.
//
// Every read goes through `resolveBrand`. Nothing else decides a fallback.

import { and, eq, like, ne } from "drizzle-orm";
import { db } from "./client";
import { normalizePortalHost } from "./portal-host";
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

/**
 * The brand as every customer-facing surface consumes it.
 *
 * ⚠️ `faviconUrl` is a PORTAL concern and is deliberately absent from
 * `EmailBrand`. Mail has no tab icon.
 */
export type ResolvedBrand = {
	workspaceId: string;
	name: string;
	supportEmail: string;
	/**
	 * Who transactional mail is FROM, already formatted as `Name <address>`.
	 *
	 * ⚠️ Undefined when the workspace has not set a sender, which means the
	 * platform sender is used and the customer sees QuickEngine in their inbox.
	 * That is the state every workspace starts in, and the thing Connect should
	 * nag about hardest.
	 */
	sender?: string;
	logoUrl?: string;
	faviconUrl?: string;
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
			senderEmail: workspaceBranding.senderEmail,
			logoUrl: workspaceBranding.logoUrl,
			faviconUrl: workspaceBranding.faviconUrl,
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
		/**
		 * 🔑 Formatted here, once, so every caller sends the same `From:`.
		 *
		 * The display name is the BUSINESS's, never the platform's — a customer
		 * reading their inbox should see "Caffeinate", not the address alone and
		 * certainly not QuickEngine.
		 */
		sender: senderAddress(
			row.senderEmail,
			row.displayName?.trim() || row.workspaceName,
		),
		logoUrl: row.logoUrl ?? undefined,
		faviconUrl: row.faviconUrl ?? undefined,
		tagline: row.tagline ?? undefined,
		accentColor: row.accentColor ?? undefined,
		websiteUrl: row.websiteUrl ?? undefined,
	};
}

/**
 * Build a `From:` header, or nothing at all.
 *
 * 🔴 Returns undefined rather than guessing. A sender the mail provider has not
 * verified is REFUSED, so inventing one from the support address or the website
 * domain would turn "wrongly branded email" into "no email", which is worse.
 *
 * ⚠️ Quotes are stripped from the display name. An unescaped `"` inside a
 * `"Name" <addr>` header is how a From line becomes two.
 */
function senderAddress(
	email: string | null,
	displayName: string,
): string | undefined {
	const address = email?.trim();
	if (!address) return undefined;
	const label = displayName.replace(/["\\<>]/g, "").trim();
	return label ? `${label} <${address}>` : address;
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

/**
 * Resolve a portal from the HOST a visitor typed.
 *
 * 🔴 This is what lets a business put the portal on its own domain —
 * `account.gemsutopia.ca` rather than `portal.quickdash.xyz/gemsutopia`. Their
 * customers never see our address, which is the point of a white-labelled
 * portal.
 *
 * ⚠️ Matched on the STORED host only. `custom_domain` is unique across the
 * table, so a domain belongs to exactly one workspace and cannot be claimed
 * twice — but nothing here proves the workspace actually controls that domain.
 * That proof is DNS: they can only point a CNAME at us for a domain they own,
 * and until they do, claiming it achieves nothing. Verification would still be
 * worth adding before this is self-serve.
 *
 * Normalised the same way on read and write, so a workspace that stored
 * `https://Account.Gemsutopia.ca/` still matches the `account.gemsutopia.ca`
 * a browser sends.
 */
export async function portalBootstrapByHost(host: string): Promise<
	| (ResolvedBrand & {
			portalSlug: string;
			publishableKey: string | null;
	  })
	| null
> {
	const normalized = normalizePortalHost(host);
	if (!normalized) return null;

	const [row] = await db
		.select({
			workspaceId: workspaceBranding.workspaceId,
			portalSlug: workspaceBranding.portalSlug,
			publishableKey: workspaceBranding.portalPublishableKey,
			enabled: workspaceBranding.portalEnabled,
		})
		.from(workspaceBranding)
		.where(eq(workspaceBranding.customDomain, normalized))
		.limit(1);

	// Same silence as the slug lookup: an unknown host and a switched-off portal
	// answer identically, so this cannot be walked to inventory customers.
	if (!row?.enabled) return null;

	const brand = await resolveBrand(row.workspaceId);
	if (!brand) return null;

	return {
		...brand,
		portalSlug: row.portalSlug,
		publishableKey: row.publishableKey,
	};
}

/** The identity fields a business edits about itself. */
export type WorkspaceBrandingInput = {
	displayName?: string | null;
	supportEmail?: string | null;
	senderEmail?: string | null;
	websiteUrl?: string | null;
	tagline?: string | null;
	accentColor?: string | null;
	logoUrl?: string | null;
};

/** What a settings screen reads back. Never a secret. */
export async function readWorkspaceBranding(workspaceId: string): Promise<
	WorkspaceBrandingInput & {
		workspaceName: string;
		portalSlug: string | null;
	}
> {
	const [row] = await db
		.select({
			workspaceName: quickengineWorkspaces.name,
			portalSlug: workspaceBranding.portalSlug,
			displayName: workspaceBranding.displayName,
			supportEmail: workspaceBranding.supportEmail,
			senderEmail: workspaceBranding.senderEmail,
			websiteUrl: workspaceBranding.websiteUrl,
			tagline: workspaceBranding.tagline,
			accentColor: workspaceBranding.accentColor,
			logoUrl: workspaceBranding.logoUrl,
		})
		.from(quickengineWorkspaces)
		.leftJoin(
			workspaceBranding,
			eq(workspaceBranding.workspaceId, quickengineWorkspaces.id),
		)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);

	if (!row) throw new Error("WORKSPACE_NOT_FOUND");
	return row;
}

/**
 * Save how a business appears to its own customers.
 *
 * 🔴 Upserts, because most workspaces have NO branding row at all. Until this
 * existed the row was created only by a local script, so in production a
 * business could never set its own name, support address or sender — and every
 * email it sent went out as the platform.
 *
 * ⚠️ `portal_slug` is NOT NULL and globally unique, so creating a row has to
 * mint one. It is derived from the workspace name rather than asked for: a
 * business editing its support email should not be made to name a portal it may
 * never turn on.
 *
 * Empty strings are stored as NULL. "" and "unset" mean the same thing to a
 * person clearing a field, and only one of them falls back correctly.
 */
export async function saveWorkspaceBranding(
	workspaceId: string,
	input: WorkspaceBrandingInput,
): Promise<void> {
	const clean = (value: string | null | undefined) =>
		value === undefined ? undefined : value?.trim() || null;

	const values = {
		displayName: clean(input.displayName),
		supportEmail: clean(input.supportEmail),
		senderEmail: clean(input.senderEmail),
		websiteUrl: clean(input.websiteUrl),
		tagline: clean(input.tagline),
		accentColor: clean(input.accentColor),
		logoUrl: clean(input.logoUrl),
	};
	const changes = Object.fromEntries(
		Object.entries(values).filter(([, value]) => value !== undefined),
	);
	if (Object.keys(changes).length === 0) return;

	const [existing] = await db
		.select({ id: workspaceBranding.id })
		.from(workspaceBranding)
		.where(eq(workspaceBranding.workspaceId, workspaceId))
		.limit(1);

	if (existing) {
		await db
			.update(workspaceBranding)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(workspaceBranding.id, existing.id));
		return;
	}

	const [workspace] = await db
		.select({ name: quickengineWorkspaces.name })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

	await db.insert(workspaceBranding).values({
		workspaceId,
		portalSlug: await availablePortalSlug(workspace.name),
		...changes,
	});
}

/** Attach or clear a workspace's custom portal domain. */
export async function setPortalCustomDomain(
	workspaceId: string,
	domain: string | null,
): Promise<{ customDomain: string | null }> {
	const normalized = domain === null ? null : normalizePortalHost(domain);
	if (domain !== null && normalized === null) {
		throw new Error("PORTAL_DOMAIN_INVALID");
	}

	const [row] = await db
		.update(workspaceBranding)
		.set({ customDomain: normalized, updatedAt: new Date() })
		.where(eq(workspaceBranding.workspaceId, workspaceId))
		.returning({ customDomain: workspaceBranding.customDomain });

	if (!row) throw new Error("PORTAL_NOT_CONFIGURED");
	return row;
}

/** What domain, if any, this workspace's portal answers on. */
export async function readPortalDomain(
	workspaceId: string,
): Promise<{ customDomain: string | null; portalSlug: string | null }> {
	const [row] = await db
		.select({
			customDomain: workspaceBranding.customDomain,
			portalSlug: workspaceBranding.portalSlug,
		})
		.from(workspaceBranding)
		.where(eq(workspaceBranding.workspaceId, workspaceId))
		.limit(1);
	return row ?? { customDomain: null, portalSlug: null };
}
