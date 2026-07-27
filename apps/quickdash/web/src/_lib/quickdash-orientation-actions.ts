import { workspaceApi } from "../lib/api";

export type QuickDashOrientationActionResult =
	| { ok: true }
	| { ok: false; error: string };

export async function saveQuickDashOrientationAction(input: {
	workspaceId: string;
	outcome: "completed" | "skipped";
}): Promise<QuickDashOrientationActionResult> {
	try {
		await workspaceApi(input.workspaceId).request("/quickdash/orientation", {
			method: "PUT",
			body: { outcome: input.outcome },
		});
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Workspace access is required.",
		};
	}
}

export async function restartQuickDashOrientationAction(
	workspaceId: string,
): Promise<QuickDashOrientationActionResult> {
	try {
		await workspaceApi(workspaceId).request("/quickdash/orientation", {
			method: "DELETE",
		});
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Workspace access is required.",
		};
	}
}
