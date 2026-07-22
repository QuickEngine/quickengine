import { API_HEADERS } from "@quickengine/api-contracts/headers";
import { can } from "@quickengine/auth/rbac";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type {
	PlatformDependencies,
	PlatformEnv,
	RouteAccessRequirement,
	WorkspaceResolution,
} from "./platform-types";
import { respondError } from "./respond";

function readBearer(headers: Headers): string | null {
	const authorization = headers.get(API_HEADERS.apiKey);
	if (!authorization) return null;
	const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
	return match?.[1]?.trim() || null;
}

function hasModule(workspace: WorkspaceResolution, moduleId?: string): boolean {
	return !moduleId || workspace.enabledModuleIds.includes(moduleId);
}

function rejectModule(c: Context<PlatformEnv>, moduleId?: string) {
	return respondError(
		c,
		"MODULE_DISABLED",
		`The ${moduleId} module is not enabled.`,
		403,
	);
}

async function resolveKey(
	c: Context<PlatformEnv>,
	dependencies: PlatformDependencies,
	requirement: RouteAccessRequirement,
	rawKey: string,
	channel: "bearer" | "publishable",
) {
	const key = await dependencies.verifyApiKey(rawKey);
	if (!key) {
		return respondError(
			c,
			"INVALID_API_KEY",
			"The API key is invalid, expired, or revoked.",
			401,
		);
	}

	const channelMatches =
		channel === "publishable"
			? key.type === "publishable"
			: key.type !== "publishable";
	if (!channelMatches) {
		return respondError(
			c,
			"CREDENTIAL_CHANNEL_MISMATCH",
			"This key must be sent in the correct header for its type.",
			401,
		);
	}

	const requestedWorkspace = c.req.header(API_HEADERS.workspace)?.trim();
	if (requestedWorkspace && requestedWorkspace !== key.workspaceId) {
		return respondError(
			c,
			"WORKSPACE_MISMATCH",
			"This key is scoped to another workspace.",
			403,
		);
	}
	if (!key.capabilities.includes(requirement.keyCapability)) {
		return respondError(
			c,
			"CAPABILITY_DENIED",
			"The API key lacks the required capability.",
			403,
		);
	}

	const workspace = await dependencies.getWorkspaceForKey(key.workspaceId);
	if (!workspace) {
		return respondError(
			c,
			"WORKSPACE_NOT_FOUND",
			"The workspace was not found.",
			404,
		);
	}
	if (!hasModule(workspace, requirement.module))
		return rejectModule(c, requirement.module);

	c.set("authorized", {
		auditActor: { id: key.id, type: "api_key" },
		principal: { keyId: key.id, kind: "key", type: key.type },
		workspace,
		workspaceId: key.workspaceId,
	});
	return null;
}

export function authorizeWorkspace(
	dependencies: PlatformDependencies,
	requirement: RouteAccessRequirement,
) {
	return createMiddleware<PlatformEnv>(async (c, next) => {
		const bearer = readBearer(c.req.raw.headers);
		const publishable = c.req.header(API_HEADERS.publishableKey)?.trim();
		const rawKey = bearer ?? publishable;
		if (rawKey) {
			const rejection = await resolveKey(
				c,
				dependencies,
				requirement,
				rawKey,
				bearer ? "bearer" : "publishable",
			);
			if (rejection) return rejection;
			return next();
		}

		const workspaceId = c.req.header(API_HEADERS.workspace)?.trim();
		if (!workspaceId) {
			return respondError(
				c,
				"WORKSPACE_REQUIRED",
				"A workspace header is required.",
				400,
			);
		}

		const session = await dependencies.getSession(c.req.raw.headers);
		if (!session) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"Authentication is required.",
				401,
			);
		}
		const workspace = await dependencies.getWorkspaceForUser(
			session.userId,
			workspaceId,
		);
		if (!workspace?.role) {
			return respondError(
				c,
				"WORKSPACE_NOT_FOUND",
				"The workspace was not found.",
				404,
			);
		}
		if (!can(workspace.role, requirement.sessionCapability)) {
			return respondError(
				c,
				"CAPABILITY_DENIED",
				"The user lacks the required capability.",
				403,
			);
		}
		if (!hasModule(workspace, requirement.module))
			return rejectModule(c, requirement.module);

		c.set("authorized", {
			auditActor: { id: session.userId, type: "user" },
			principal: {
				kind: "session",
				role: workspace.role,
				userId: session.userId,
			},
			workspace,
			workspaceId,
		});
		return next();
	});
}
