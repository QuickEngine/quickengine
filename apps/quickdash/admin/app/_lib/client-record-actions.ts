"use server";

import { getSession } from "@quickengine/auth/server";
import {
	clientRecordsSettingsSchema,
	createClientRecord,
	deleteClientRecord,
	updateClientRecord,
} from "@quickengine/mod-client-records";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type ClientRecordActionState = {
	error: string | null;
	completionId: string | null;
};

const failure = (error: string): ClientRecordActionState => ({
	error,
	completionId: null,
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) {
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	}
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		return { ok: false, error: "Workspace access was not found." } as const;
	}
	const module = access.modules.find(
		(module) => module.id === "client-records",
	);
	if (!module) {
		return {
			ok: false,
			error: "Client Records is not enabled for this workspace.",
		} as const;
	}
	return {
		ok: true,
		access,
		settings: clientRecordsSettingsSchema.parse(module.settings),
	} as const;
}

const inputFrom = (
	formData: FormData,
	fields: { phone: boolean; company: boolean; notes: boolean },
) => ({
	name: String(formData.get("name") ?? ""),
	email: String(formData.get("email") ?? ""),
	...(fields.phone ? { phone: String(formData.get("phone") ?? "") } : {}),
	...(fields.company ? { company: String(formData.get("company") ?? "") } : {}),
	...(fields.notes ? { notes: String(formData.get("notes") ?? "") } : {}),
});

const friendlyFailure = (error: unknown) => {
	if (error instanceof Error && error.name === "ZodError") {
		return "Check the client details and try again.";
	}
	return "We couldn't save this client. Please try again.";
};

export async function createClientRecordAction(
	_previous: ClientRecordActionState,
	formData: FormData,
): Promise<ClientRecordActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) {
		return failure(authorization.error);
	}

	try {
		await createClientRecord(
			workspaceId,
			inputFrom(formData, authorization.settings.fields),
		);
	} catch (error) {
		return failure(friendlyFailure(error));
	}

	revalidatePath(`/${workspaceId}/client-records`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function updateClientRecordAction(
	_previous: ClientRecordActionState,
	formData: FormData,
): Promise<ClientRecordActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const recordId = String(formData.get("recordId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) {
		return failure(authorization.error);
	}

	try {
		const updated = await updateClientRecord(
			workspaceId,
			recordId,
			inputFrom(formData, authorization.settings.fields),
		);
		if (!updated) {
			return failure("This client no longer exists in this workspace.");
		}
	} catch (error) {
		return failure(friendlyFailure(error));
	}

	revalidatePath(`/${workspaceId}/client-records`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function deleteClientRecordAction(
	_previous: ClientRecordActionState,
	formData: FormData,
): Promise<ClientRecordActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const recordId = String(formData.get("recordId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) {
		return failure(authorization.error);
	}

	try {
		const deleted = await deleteClientRecord(workspaceId, recordId);
		if (!deleted) {
			return failure("This client no longer exists in this workspace.");
		}
	} catch {
		return failure(
			"This record is connected to other business records and cannot be deleted yet.",
		);
	}

	revalidatePath(`/${workspaceId}/client-records`);
	return { error: null, completionId: crypto.randomUUID() };
}
