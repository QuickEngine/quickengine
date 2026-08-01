import type { ApiCapability } from "@quickengine/auth/api-keys";
import type { WorkspaceCapability } from "@quickengine/auth/rbac";
import type { QuickEngineApiKeyType } from "@quickengine/db/schema/quickengine";
import type { RequestIdVariables } from "hono/request-id";

export type ApiKeyIdentity = {
	capabilities: readonly ApiCapability[];
	id: string;
	type: QuickEngineApiKeyType;
	workspaceId: string;
};

export type SessionIdentity = { userId: string };

export type WorkspaceIdentity = {
	businessType: string;
	id: string;
	name: string;
	slug: string | null;
};

export type WorkspaceResolution = {
	enabledModuleIds: readonly string[];
	organizationId: string | null;
	/**
	 * The account usage is metered against. Metering is per-account, not per
	 * workspace — one budget shared across everything an account owns — so the
	 * owner is the scope. Becomes the organization id if an account layer lands.
	 */
	ownerId: string;
	/**
	 * The role's **name**, which may be one an organization defined for itself and
	 * is therefore not constrained to the built-in three. Present for display and
	 * audit; **never branch on it** — check `capabilities` instead.
	 */
	role?: string;
	/** What the role actually grants. The only thing authorization should read. */
	capabilities?: readonly string[];
	workspace: WorkspaceIdentity;
};

export type ApiPrincipal =
	| { kind: "session"; role: string; userId: string }
	| { keyId: string; kind: "key"; type: QuickEngineApiKeyType };

export type AuditActor =
	| { id: string; type: "user" }
	| { id: string; type: "api_key" };

export type AuthorizedApiContext = {
	auditActor: AuditActor;
	principal: ApiPrincipal;
	workspace: WorkspaceResolution;
	workspaceId: string;
};

export type PlatformVariables = {
	authorized: AuthorizedApiContext;
	/** The plan whose limits applied, set during usage enforcement. */
	planId?: string;
	abortSignal: AbortSignal;
	deadlineAtMs: number;
};

export type PlatformEnv = {
	Variables: RequestIdVariables & PlatformVariables;
};

export type PlatformDependencies = {
	getSession(headers: Headers): Promise<SessionIdentity | null>;
	getWorkspaceForKey(workspaceId: string): Promise<WorkspaceResolution | null>;
	getWorkspaceForUser(
		userId: string,
		workspaceId: string,
	): Promise<WorkspaceResolution | null>;
	verifyApiKey(rawKey: string): Promise<ApiKeyIdentity | null>;
	/**
	 * Optional. Absent in tests and local development, so neither accumulates usage
	 * nor gates on it. Production supplies `enforce` from `@quickengine/billing`.
	 */
	enforceUsage?: import("./usage-enforcement").UsageEnforcer;
	/**
	 * Optional, and set once by `registerAllRoutes`.
	 *
	 * 🔴 Lives here rather than as an argument because `authorizeWorkspace` is
	 * called from ~20 route files and none of them passed a logger. The result
	 * was that `enforceUsage` — which logs `usage.enforcement_failed` on a throw —
	 * was always called without one, so metering could fail on every request in
	 * production and emit nothing at all.
	 */
	logger?: import("./logger").ApiLogger;
};

export type RouteAccessRequirement = {
	keyCapability: ApiCapability;
	module?: string;
	sessionCapability: WorkspaceCapability;
};
