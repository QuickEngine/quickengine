import { clientRecords, db, eq, quickengineWorkspaces } from "@quickengine/db";

export type ClientRecordInput = {
	name: string;
	email?: string | null;
	phone?: string | null;
	company?: string | null;
	notes?: string | null;
	fields?: Record<string, string>;
};

// Create a client record. NOT metered — storing a contact is not a billable action
// (you don't pay to have customers). A contact is a row of DB space, so the only
// billing lever near it is a free-tier *count cap*, enforced at the plan layer, not
// a per-create charge here.
export async function createClientRecord(
	workspaceId: string,
	input: ClientRecordInput,
) {
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
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
	return record;
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

/** Update a record's fields. */
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
