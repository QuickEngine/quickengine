import { holds, resolveOrgAccess } from "@quickengine/auth/rbac";
import type { MiddlewareHandler } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

/**
 * Authorization for **account-level** endpoints — workspaces, team, billing,
 * API keys, organizations.
 *
 * Distinct from `authorizeWorkspace` because these operate *above* a workspace:
 * creating one, listing them, inviting a member. There is no workspace to scope
 * to, and several of them run before the caller has any workspace at all.
 *
 * **Session only, never API keys.** An API key is issued to a workspace and
 * scoped to its data; letting one create workspaces, mint further keys, or
 * remove members would turn a leaked key for a single workspace into control of
 * the whole account. These actions require a human session.
 */
export type AccountContext = {
	userId: string;
	organizationId: string;
	role: string;
	capabilities: readonly string[];
};

declare module "hono" {
	interface ContextVariableMap {
		account: AccountContext;
	}
}

export function authorizeAccount(
	platform: PlatformDependencies,
	requirement: {
		/** The capability the caller must hold on the organization. */
		capability: Parameters<typeof holds>[1];
		/**
		 * Where the organization id comes from. Most routes take it as a query
		 * parameter or path segment; a few derive it from the body.
		 */
		organizationIdFrom?: "query" | "param";
	},
	options?: { logger?: ApiLogger },
): MiddlewareHandler<PlatformEnv> {
	const source = requirement.organizationIdFrom ?? "query";

	return async (c, next) => {
		const session = await platform.getSession(c.req.raw.headers);
		if (!session) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"Sign in to continue.",
				401,
			);
		}

		const organizationId =
			source === "param"
				? c.req.param("organizationId")
				: c.req.query("organizationId");
		if (!organizationId) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"organizationId is required.",
				400,
			);
		}

		const access = await resolveOrgAccess(session.userId, organizationId);
		if (!access) {
			// Deliberately 404, not 403: telling a stranger an organization exists but
			// is off-limits leaks its existence. Non-membership and non-existence are
			// indistinguishable from outside.
			return respondError(c, "NOT_FOUND", "Organization not found.", 404);
		}

		if (!holds(access, requirement.capability)) {
			options?.logger?.warn("account.capability_denied", {
				capability: requirement.capability,
				requestId: c.get("requestId"),
			});
			return respondError(
				c,
				"CAPABILITY_DENIED",
				"You do not have permission to do that.",
				403,
			);
		}

		c.set("account", {
			userId: session.userId,
			organizationId,
			role: access.role,
			capabilities: access.capabilities,
		});
		await next();
	};
}

/**
 * A session with no organization requirement — for endpoints that run *before*
 * an organization is chosen, such as creating one or listing what you belong to.
 */
export function authorizeSession(
	platform: PlatformDependencies,
): MiddlewareHandler<PlatformEnv> {
	return async (c, next) => {
		const session = await platform.getSession(c.req.raw.headers);
		if (!session) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"Sign in to continue.",
				401,
			);
		}
		c.set("account", {
			userId: session.userId,
			organizationId: "",
			role: "",
			capabilities: [],
		});
		await next();
	};
}
