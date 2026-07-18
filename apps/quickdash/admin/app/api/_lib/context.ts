import type { ApiCapability } from "@quickengine/auth/api-keys";
import { verifyApiKey } from "@quickengine/auth/api-keys";
import { getSession } from "@quickengine/auth/server";
import type { QuickEngineApiKeyType } from "@quickengine/db/schema/quickengine";
import type { NextResponse } from "next/server";
import {
	loadWorkspaceForKey,
	requireWorkspaceAccess,
} from "../../_lib/workspace-access";
import { fail } from "./respond";

// The common workspace-access shape shared by both principals. Based on the API-key loader
// (which has no user role); a session's richer result (which also carries a role) is
// assignable to it.
type WorkspaceAccess = NonNullable<
	Awaited<ReturnType<typeof loadWorkspaceForKey>>
>;

// Who made the request. Either a signed-in operator (full workspace access) or an API
// key (scoped to its workspace + capability allowlist).
export type ApiPrincipal =
	| { kind: "session"; userId: string }
	| { kind: "key"; keyId: string; type: QuickEngineApiKeyType };

export type ApiContext = {
	requestId: string;
	workspaceId: string;
	access: WorkspaceAccess;
	principal: ApiPrincipal;
};

export type RouteRequirement = {
	/** The module that must be enabled for the workspace. */
	module: string;
	/** The capability an API key must hold (session callers are implicitly full-access). */
	capability: ApiCapability;
};

function readBearer(headers: Headers): string | null {
	const auth = headers.get("Authorization");
	if (!auth) return null;
	const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
	return match ? match[1].trim() : null;
}

/**
 * The single gate for every v1 route. Resolves the caller (API key, else session),
 * confirms the target workspace, and enforces the required module + capability — the same
 * authorization envelope the module pages use, so the API can never grant more than the
 * UI. Returns the resolved context or a ready-to-return error response.
 *
 * Auth precedence: a `Authorization: Bearer` secret/scoped key, then a
 * `QuickEngine-Publishable-Key`, then the signed-in session. A key's own workspace is the
 * scope; a mismatching `QuickEngine-Workspace` header is rejected.
 */
export async function resolveContext(
	request: Request,
	id: string,
	required: RouteRequirement,
): Promise<{ context: ApiContext } | { error: NextResponse }> {
	const headerWorkspace = request.headers.get("QuickEngine-Workspace")?.trim();

	// --- API-key path ---------------------------------------------------------------
	const bearer = readBearer(request.headers);
	const publishable = request.headers
		.get("QuickEngine-Publishable-Key")
		?.trim();
	const rawKey = bearer ?? (publishable || null);
	const channel: "bearer" | "publishable" | null = bearer
		? "bearer"
		: publishable
			? "publishable"
			: null;

	if (rawKey && channel) {
		const key = await verifyApiKey(rawKey);
		if (!key) {
			return {
				error: fail(
					"unauthorized",
					"The API key is invalid, expired, or revoked.",
					401,
					id,
				),
			};
		}

		// A secret/scoped key must never be accepted from the public publishable header,
		// and a publishable key must be sent in its own header — no category laundering.
		const categoryOk =
			channel === "publishable"
				? key.type === "publishable"
				: key.type !== "publishable";
		if (!categoryOk) {
			return {
				error: fail(
					"credential_channel_mismatch",
					"This key must be sent in the correct header for its type.",
					401,
					id,
				),
			};
		}

		if (headerWorkspace && headerWorkspace !== key.workspaceId) {
			return {
				error: fail(
					"workspace_mismatch",
					"This key is not scoped to the requested workspace.",
					403,
					id,
				),
			};
		}

		if (!key.capabilities.includes(required.capability)) {
			return {
				error: fail(
					"capability_denied",
					`This key does not hold the ${required.capability} capability.`,
					403,
					id,
				),
			};
		}

		const access = await loadWorkspaceForKey(key.workspaceId);
		if (!access) {
			return {
				error: fail(
					"workspace_not_found",
					"This workspace was not found.",
					404,
					id,
				),
			};
		}
		if (!access.modules.some((module) => module.id === required.module)) {
			return {
				error: fail(
					"module_disabled",
					`The ${required.module} module is not enabled for this workspace.`,
					403,
					id,
				),
			};
		}

		return {
			context: {
				requestId: id,
				workspaceId: key.workspaceId,
				access,
				principal: { kind: "key", keyId: key.id, type: key.type },
			},
		};
	}

	// --- Session path -----------------------------------------------------------------
	if (!headerWorkspace) {
		return {
			error: fail(
				"workspace_required",
				"A QuickEngine-Workspace header or an API key is required.",
				400,
				id,
			),
		};
	}

	const session = await getSession(request.headers);
	if (!session) {
		return {
			error: fail("unauthorized", "Authentication is required.", 401, id),
		};
	}

	const access = await requireWorkspaceAccess(session.user.id, headerWorkspace);
	if (!access) {
		return {
			error: fail(
				"workspace_not_found",
				"This workspace was not found, or you do not have access to it.",
				404,
				id,
			),
		};
	}

	if (!access.modules.some((module) => module.id === required.module)) {
		return {
			error: fail(
				"module_disabled",
				`The ${required.module} module is not enabled for this workspace.`,
				403,
				id,
			),
		};
	}

	return {
		context: {
			requestId: id,
			workspaceId: headerWorkspace,
			access,
			principal: { kind: "session", userId: session.user.id },
		},
	};
}
