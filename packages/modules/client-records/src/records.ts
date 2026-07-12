import { enforce } from "@quickengine/billing";
import { clientRecords, db, eq, quickengineWorkspaces } from "@quickengine/db";

export type ClientRecordInput = {
	name: string;
	email?: string | null;
	phone?: string | null;
	company?: string | null;
	notes?: string | null;
	fields?: Record<string, string>;
};

// Create a client record. First passes through the metering gate — creating a
// record consumes one "action" against the workspace's account. If the account is
// past its grace ceiling the create is blocked and the caller surfaces an upgrade
// prompt (`usage` carries the state). This is the first module wired to metering.
//
// Metered per the account owner for now (matches the engine's current user-scope);
// flips to the workspace's org once team billing lands.
export async function createClientRecord(
	workspaceId: string,
	input: ClientRecordInput,
) {
	const [workspace] = await db
		.select({ ownerId: quickengineWorkspaces.ownerId })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
	}

	const gate = await enforce({ scopeId: workspace.ownerId, meter: "actions" });
	if (!gate.allowed) {
		return { ok: false as const, usage: gate };
	}

	const [record] = await db
		.insert(clientRecords)
		.values({
			workspaceId,
			name: input.name,
			email: input.email ?? null,
			phone: input.phone ?? null,
			company: input.company ?? null,
			notes: input.notes ?? null,
			fields: input.fields ?? {},
		})
		.returning();
	return { ok: true as const, record };
}

/** All records in a workspace. */
export async function listClientRecords(workspaceId: string) {
	return db
		.select()
		.from(clientRecords)
		.where(eq(clientRecords.workspaceId, workspaceId));
}

/** A single record by id (or undefined). */
export async function getClientRecord(id: string) {
	const [record] = await db
		.select()
		.from(clientRecords)
		.where(eq(clientRecords.id, id))
		.limit(1);
	return record;
}

/** Update a record's fields (does not re-meter — only creation is a new action). */
export async function updateClientRecord(
	id: string,
	patch: Partial<ClientRecordInput>,
) {
	const [record] = await db
		.update(clientRecords)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(clientRecords.id, id))
		.returning();
	return record;
}

/** Permanently delete a record. */
export async function deleteClientRecord(id: string) {
	await db.delete(clientRecords).where(eq(clientRecords.id, id));
}
