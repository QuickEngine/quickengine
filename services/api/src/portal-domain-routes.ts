import {
	normalizePortalHost,
	readPortalDomain,
	setPortalCustomDomain,
} from "@quickengine/db";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * `/v1/portal/domain` — putting a workspace's customer portal on its own domain.
 *
 * 🔴 The white-label path. Without this a business's customers see
 * `portal.quickdash.xyz/gemsutopia`; with it they see `account.gemsutopia.ca`
 * and never learn we exist. That is the whole point of a hosted portal.
 *
 * ⚠️ Setting a domain here proves nothing about owning it. Ownership is proved
 * by DNS — a CNAME can only be pointed by whoever controls the zone — so
 * claiming a domain you do not own achieves nothing except denying it to its
 * real owner, which the UNIQUE constraint turns into an error rather than a
 * silent theft. Explicit verification (a TXT record) is worth adding before this
 * is self-serve; see the note in the PR.
 */
/**
 * ⚠️ Defined HERE, not in `packages/db`, and exported for the OpenAPI document.
 *
 * A zod schema cannot cross a package boundary in this monorepo: the two
 * packages resolve different zod instances, so a schema built in `db` is not
 * assignable to `ZodType` in the API. Same pattern as `createApiKeySchema` in
 * `account-routes.ts`.
 */
export const portalDomainInputSchema = z.object({
	// Null clears it and sends the portal back to its path-based address.
	domain: z.string().trim().max(253).nullable(),
});

const domainSchema = portalDomainInputSchema;

export function registerPortalDomainRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const read = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		module: "client-records",
		sessionCapability: "workspace.view",
	});
	const write = authorizeWorkspace(options.platform, {
		// Changing where a business's customers are sent is workspace
		// administration, not record editing.
		keyCapability: "catalog:write",
		module: "client-records",
		sessionCapability: "workspace.manage",
	});

	app.get("/v1/portal/domain", read, async (c) =>
		respond(c, await readPortalDomain(c.get("authorized").workspaceId)),
	);

	app.put("/v1/portal/domain", write, async (c) => {
		const parsed = domainSchema.safeParse(await c.req.json().catch(() => ({})));
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Send a domain, or null to remove it.",
				400,
				parsed.error.issues,
			);
		}

		// Rejected before the write so the operator gets "that isn't a domain"
		// rather than a constraint error from the database.
		if (
			parsed.data.domain !== null &&
			normalizePortalHost(parsed.data.domain) === null
		) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That doesn't look like a domain. Use something like account.yourshop.com.",
				400,
			);
		}

		try {
			const result = await setPortalCustomDomain(
				c.get("authorized").workspaceId,
				parsed.data.domain,
			);
			return respond(c, {
				...result,
				// What the operator has to do next. A domain that resolves nowhere is
				// the most common support question this feature could generate.
				cname: result.customDomain ? "portal.quickdash.xyz" : null,
			});
		} catch (error) {
			return mapDomainError(c, error);
		}
	});
}

function mapDomainError(c: Context<PlatformEnv>, error: unknown) {
	if (error instanceof Error) {
		if (error.message === "PORTAL_DOMAIN_INVALID") {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That isn't a valid domain.",
				400,
			);
		}
		if (error.message === "PORTAL_NOT_CONFIGURED") {
			return respondError(
				c,
				"NOT_FOUND",
				"Publish your customer portal before giving it a domain.",
				404,
			);
		}
		// A domain already claimed by another workspace. Drizzle wraps driver
		// errors, so match SQLSTATE on the cause chain — see DB_RULES.
		for (
			let cause: unknown = error, depth = 0;
			cause && depth < 5;
			depth += 1
		) {
			if ((cause as { code?: string }).code === "23505") {
				return respondError(
					c,
					"CONFLICT",
					"That domain is already connected to another workspace.",
					409,
				);
			}
			cause = (cause as { cause?: unknown }).cause;
		}
	}
	throw error;
}
