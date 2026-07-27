import { workspaceApi } from "../lib/api";

export type ClientRecordActionState = {
	error: string | null;
	completionId: string | null;
};

const result = async (operation: () => Promise<unknown>) => {
	try {
		await operation();
		return { error: null, completionId: crypto.randomUUID() };
	} catch (cause) {
		return {
			error:
				cause instanceof Error
					? cause.message
					: "We couldn't save this client. Please try again.",
			completionId: null,
		};
	}
};

const inputFrom = (form: FormData) => ({
	name: String(form.get("name") ?? ""),
	email: String(form.get("email") ?? "") || undefined,
	phone: String(form.get("phone") ?? "") || undefined,
	company: String(form.get("company") ?? "") || undefined,
	notes: String(form.get("notes") ?? "") || undefined,
});

export function createClientRecordAction(
	_previous: ClientRecordActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return result(() =>
		api.clients.create(
			inputFrom(form),
			String(form.get("idempotencyKey") ?? crypto.randomUUID()),
		),
	);
}

export function updateClientRecordAction(
	_previous: ClientRecordActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return result(() =>
		api.clients.update(
			String(form.get("recordId") ?? ""),
			inputFrom(form),
			String(form.get("idempotencyKey") ?? crypto.randomUUID()),
		),
	);
}

export function deleteClientRecordAction(
	_previous: ClientRecordActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return result(() =>
		api.clients.delete(
			String(form.get("recordId") ?? ""),
			String(form.get("idempotencyKey") ?? crypto.randomUUID()),
		),
	);
}
