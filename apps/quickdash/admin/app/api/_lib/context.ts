import { getSession } from "@quickengine/auth/server";
import type { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "../../_lib/workspace-access";
import { fail } from "./respond";

type WorkspaceAccess = NonNullable<
	Awaited<ReturnType<typeof requireWorkspaceAccess>>
>;

export type ApiContext = {
	requestId: string;
	workspaceId: string;
	userId: string;
	access: WorkspaceAccess;
};

/**
 * The single gate for every authenticated v1 route: resolve the target workspace from
 * the `QuickEngine-Workspace` header, authenticate the caller, authorize workspace
 * access, and confirm the required module is enabled. Returns the resolved context or a
 * ready-to-return error response — the same authorization seam the module pages use, so
 * the API can never grant more than the UI.
 *
 * This first slice authenticates by session (the signed-in operator). Publishable and
 * scoped API keys plug into this same function when key issuance lands.
 */
export async function resolveContext(
	request: Request,
	id: string,
	requiredModule: string,
): Promise<{ context: ApiContext } | { error: NextResponse }> {
	const workspaceId = request.headers.get("QuickEngine-Workspace")?.trim();
	if (!workspaceId) {
		return {
			error: fail(
				"workspace_required",
				"A QuickEngine-Workspace header is required.",
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

	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
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

	if (!access.modules.some((module) => module.id === requiredModule)) {
		return {
			error: fail(
				"module_disabled",
				`The ${requiredModule} module is not enabled for this workspace.`,
				403,
				id,
			),
		};
	}

	return {
		context: { requestId: id, workspaceId, userId: session.user.id, access },
	};
}
