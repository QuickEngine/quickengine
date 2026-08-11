import type { ApiCapability } from "@quickengine/auth/api-keys";
import type { WorkspaceCapability } from "@quickengine/auth/rbac";
import type { QuickEngineApiKeyType } from "@quickengine/db/schema/quickengine";
import type { RequestIdVariables } from "hono/request-id";

export type ApiKeyIdentity = {
	allowedOrigins: readonly string[];
	capabilities: readonly ApiCapability[];
	id: string;
	type: QuickEngineApiKeyType;
	workspaceId: string;
};

export type SessionIdentity = { userId: string };

export type WorkspaceIdentity = {
	businessType: string;
	environment: "test" | "live";
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

/**
 * An END CUSTOMER — one of our users' users. A shopper, a massage client, an
 * agency's client, a student.
 *
 * 🔴 Deliberately NOT a member of `ApiPrincipal`. An operator principal and a
 * customer principal must never be assignable to one another: the day they
 * unify by accident is the day a shopper's token satisfies an operator route.
 * They live in separate context slots (`authorized` vs `customer`) set by
 * separate middleware, and no code path produces both.
 */
export type CustomerPrincipal = {
	kind: "customer";
	/** Verified email for this signed-in identity; safe only on their own route. */
	email: string;
	/** The membership. Scoped to ONE workspace — this is what isolates tenants. */
	workspaceCustomerId: string;
	/** The person, who may hold memberships elsewhere. Never used for scoping. */
	identityId: string;
	/**
	 * The `client_records` row this customer is bound to, and the ONLY value any
	 * customer read may filter by.
	 *
	 * Null when an identity exists but has not yet been matched to a record —
	 * verified, signed in, and simply has no history. Routes must treat null as
	 * "no records", never as "no filter".
	 */
	clientRecordId: string | null;
};

export type CustomerContext = {
	/** Exact browser origins registered on the presented public key. */
	allowedOrigins: readonly string[];
	workspaceId: string;
	workspace: WorkspaceResolution;
	/**
	 * Null on public customer routes — a publishable key alone identifies the
	 * workspace but nobody in particular. Reading catalog: fine. Reading orders:
	 * requires this.
	 */
	customer: CustomerPrincipal | null;
};

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
	/**
	 * Set ONLY by `authorizeCustomer`, and `authorized` is never set alongside
	 * it. An operator route reading `authorized` therefore cannot be reached by
	 * a customer, and a customer route reading this cannot be reached by an
	 * operator key. The wall is that the two slots are disjoint.
	 */
	customer: CustomerContext;
	/** The plan whose limits applied, set during usage enforcement. */
	planId?: string;
	abortSignal: AbortSignal;
	deadlineAtMs: number;
};

export type PlatformEnv = {
	Variables: RequestIdVariables & PlatformVariables;
};

/** What a valid customer session token resolves to. */
export type CustomerSessionResolution = {
	email: string;
	workspaceCustomerId: string;
	workspaceId: string;
	identityId: string;
	clientRecordId: string | null;
};

export type PlatformDependencies = {
	getSession(headers: Headers): Promise<SessionIdentity | null>;
	/**
	 * Resolve a customer session token. Hashes the presented token and looks it
	 * up; returns null for unknown, expired or revoked.
	 *
	 * Optional so an app assembled without the customer surface simply has no
	 * customer routes, rather than routes that fail at request time.
	 */
	resolveCustomerSession?(
		token: string,
	): Promise<CustomerSessionResolution | null>;
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
