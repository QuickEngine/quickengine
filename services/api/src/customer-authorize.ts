import { API_HEADERS } from "@quickengine/api-contracts/headers";
import { isBrowserKeyType } from "@quickengine/auth/api-keys";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type {
	CustomerPrincipal,
	PlatformDependencies,
	PlatformEnv,
	WorkspaceResolution,
} from "./platform-types";
import { respondError } from "./respond";
import { enforceUsage } from "./usage-enforcement";

/**
 * THE CUSTOMER BOUNDARY.
 *
 * Everything under `/v1/customer/*` is reached by our USERS' USERS — a shopper,
 * a massage client, an agency's client, a student. It is the only surface a
 * stranger's browser is invited to call, so it is the one that has to assume
 * every request is hostile.
 *
 * Two credentials, two questions:
 *
 * - The **publishable key** answers WHICH WORKSPACE. It is embedded in a public
 *   storefront and must be treated as known to everybody.
 * - The **customer session** answers WHICH PERSON. It is secret, and it is the
 *   only thing that unlocks anybody's records.
 *
 * The key alone reads the catalog. The pair reads your orders. Nothing reads
 * anyone else's.
 *
 * 🔴 THE WALL. This middleware never sets `authorized`, and `authorizeWorkspace`
 * never reads `customer`. The two context slots are disjoint, filled by
 * different middleware, from different headers. An operator route asking for
 * `authorized` therefore cannot be satisfied by a customer, and a customer
 * route asking for `customer` cannot be satisfied by an operator key. The
 * separation is structural rather than a check somebody has to remember.
 */

export type CustomerRouteRequirement = {
	/**
	 * Whether a signed-in customer is required.
	 *
	 * `false` for genuinely public reads — the catalog, the workspace's name and
	 * enabled modules. `true` for anything belonging to a person.
	 */
	requireSession: boolean;
	/** Module that must be enabled on the workspace, if the route belongs to one. */
	module?: string;
};

function rejectModule(c: Context<PlatformEnv>, moduleId?: string) {
	return respondError(
		c,
		"MODULE_DISABLED",
		`The ${moduleId} module is not enabled.`,
		403,
	);
}

export function authorizeCustomer(
	dependencies: PlatformDependencies,
	requirement: CustomerRouteRequirement,
) {
	return createMiddleware<PlatformEnv>(async (c, next) => {
		const rawKey = c.req.header(API_HEADERS.publishableKey)?.trim();
		if (!rawKey) {
			return respondError(
				c,
				"PUBLISHABLE_KEY_REQUIRED",
				"A publishable key is required.",
				401,
			);
		}

		const key = await dependencies.verifyApiKey(rawKey);
		if (!key) {
			return respondError(
				c,
				"INVALID_API_KEY",
				"The API key is invalid, expired, or revoked.",
				401,
			);
		}

		// 🔴 BROWSER keys only — publishable or storefront.
		//
		// A secret or scoped key carries an operator's full authority, and
		// honouring one here would let anybody who leaked a server key read every
		// customer's records through a public endpoint. That is a mistake worth
		// refusing loudly rather than accepting because it is "more" privileged.
		//
		// `storefront` is admitted deliberately: a merchant putting sign-in on
		// their own site holds a storefront key, not a publishable one, and
		// refusing it would force them to carry two credentials for one page.
		// Admitting it is safe because these routes scope to a CUSTOMER SESSION,
		// never to the key — the key only answers "which workspace".
		if (!isBrowserKeyType(key.type)) {
			return respondError(
				c,
				"CREDENTIAL_CHANNEL_MISMATCH",
				"This endpoint accepts a publishable or storefront key only.",
				401,
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

		if (
			requirement.module &&
			!workspace.enabledModuleIds.includes(requirement.module)
		) {
			return rejectModule(c, requirement.module);
		}

		const customer = await resolveCustomer(
			c,
			dependencies,
			key.workspaceId,
			requirement,
		);
		// A rejection is returned as a Response; a legitimate anonymous caller is
		// `null`. `undefined` is impossible, and distinguishing the two is why this
		// is not simply falsy-checked.
		if (customer instanceof Response) return customer;

		c.set("customer", {
			workspaceId: key.workspaceId,
			workspace: workspace as WorkspaceResolution,
			customer,
		});

		// Usage is charged to the account that OWNS the workspace, never to the
		// visitor. A storefront's traffic is its operator's cost.
		const overLimit = await enforceUsage(
			c,
			dependencies.enforceUsage,
			workspace.organizationId,
			dependencies.logger,
		);
		if (overLimit) return overLimit;

		return next();
	});
}

async function resolveCustomer(
	c: Context<PlatformEnv>,
	dependencies: PlatformDependencies,
	workspaceId: string,
	requirement: CustomerRouteRequirement,
): Promise<CustomerPrincipal | null | Response> {
	const token = c.req.header(API_HEADERS.customerSession)?.trim();

	if (!token) {
		if (!requirement.requireSession) return null;
		return respondError(
			c,
			"AUTHENTICATION_REQUIRED",
			"Sign in to view this.",
			401,
		);
	}

	if (!dependencies.resolveCustomerSession) {
		// The app was assembled without the customer surface. Refusing beats
		// treating a presented token as anonymous, which would quietly downgrade a
		// signed-in request instead of failing.
		return respondError(
			c,
			"AUTHENTICATION_REQUIRED",
			"Sign in to view this.",
			401,
		);
	}

	const session = await dependencies.resolveCustomerSession(token);
	if (!session) {
		return respondError(
			c,
			"SESSION_EXPIRED",
			"This session is no longer valid. Sign in again.",
			401,
		);
	}

	// 🔴 The tenant check. A session is minted for ONE workspace, and the
	// publishable key names the workspace being asked about. If they disagree,
	// someone is presenting a session from storefront A to storefront B —
	// accepting it would be a cross-tenant read. Cheap comparison, and it is the
	// single thing standing between two of our users' customer lists.
	if (session.workspaceId !== workspaceId) {
		return respondError(
			c,
			"SESSION_WORKSPACE_MISMATCH",
			"This session belongs to a different workspace.",
			403,
		);
	}

	return {
		kind: "customer",
		workspaceCustomerId: session.workspaceCustomerId,
		identityId: session.identityId,
		clientRecordId: session.clientRecordId,
	};
}

/**
 * The client record a customer route may read, or a refusal.
 *
 * Every customer-scoped query filters by this and nothing else. Routes must not
 * reach into `customer.clientRecordId` themselves — going through one function
 * is what makes "did we remember to filter?" answerable by reading a single
 * place instead of auditing twenty.
 *
 * A verified customer with no client record is not an error: they signed in and
 * have no history yet. They get an empty list, never an unfiltered one.
 */
export function customerScope(c: Context<PlatformEnv>): {
	workspaceId: string;
	clientRecordId: string | null;
} {
	const context = c.get("customer");
	return {
		workspaceId: context.workspaceId,
		clientRecordId: context.customer?.clientRecordId ?? null,
	};
}
