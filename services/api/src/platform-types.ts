import type { ApiCapability } from "@quickengine/auth/api-keys";
import type {
	WorkspaceCapability,
	WorkspaceRole,
} from "@quickengine/auth/rbac";
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
	role?: WorkspaceRole;
	workspace: WorkspaceIdentity;
};

export type ApiPrincipal =
	| { kind: "session"; role: WorkspaceRole; userId: string }
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
};

export type RouteAccessRequirement = {
	keyCapability: ApiCapability;
	module?: string;
	sessionCapability: WorkspaceCapability;
};
