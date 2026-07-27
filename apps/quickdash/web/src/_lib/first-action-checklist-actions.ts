import { workspaceApi } from "../lib/api";

export async function saveFirstActionChecklistPresentationAction(input: {
	workspaceId: string;
	collapsed: boolean;
	dismissed: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		await workspaceApi(input.workspaceId).request("/quickdash/checklist", {
			method: "PUT",
			body: { collapsed: input.collapsed, dismissed: input.dismissed },
		});
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "The checklist could not be saved.",
		};
	}
}
