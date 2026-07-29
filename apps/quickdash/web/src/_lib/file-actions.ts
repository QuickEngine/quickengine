import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type FileActionState = ActionState;

export function createFolderAction(_previous: FileActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.files.createFolder(
				{
					name: String(form.get("name") ?? ""),
					parentId: String(form.get("parentId") ?? "") || null,
				},
				idempotencyKey(form),
			),
		"Check the folder name and parent.",
	);
}

export function uploadFileAction(_previous: FileActionState, form: FormData) {
	const workspaceId = String(form.get("workspaceId") ?? "");
	const file = form.get("file");
	return actionResult(async () => {
		if (!(file instanceof File) || file.size === 0) {
			throw new Error("Choose a nonempty file.");
		}
		const body = new FormData();
		for (const name of ["file", "title", "folderId", "tags", "description"]) {
			const value = form.get(name);
			if (value !== null) body.set(name, value);
		}
		const response = await fetch("/v1/quickdash/files/upload", {
			method: "POST",
			body,
			credentials: "include",
			headers: {
				"Idempotency-Key": idempotencyKey(form),
				"QuickEngine-Workspace": workspaceId,
			},
		});
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as {
				error?: { message?: string };
			} | null;
			throw new Error(
				payload?.error?.message ?? "The file could not be uploaded.",
			);
		}
	}, "The file could not be verified and stored. Check its size, type, and storage configuration.");
}

export function fileStatusAction(_previous: FileActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.files.setStatus(
				String(form.get("documentId") ?? ""),
				String(form.get("target")) as "active" | "archived" | "trashed",
				idempotencyKey(form),
			),
		"That file state transition is unavailable.",
	);
}

export function deleteFileAction(_previous: FileActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.files.delete(
				String(form.get("documentId") ?? ""),
				idempotencyKey(form),
			),
		"Only a trashed document can be permanently deleted. Restore or remove any blocking attachments first.",
	);
}

export async function downloadFileAction(form: FormData) {
	const workspaceId = String(form.get("workspaceId") ?? "");
	const documentId = String(form.get("documentId") ?? "");
	const result = await workspaceApi(workspaceId).request<{ url: string }>(
		`/quickdash/files/${encodeURIComponent(documentId)}/download`,
	);
	window.location.assign(result.data.url);
}
