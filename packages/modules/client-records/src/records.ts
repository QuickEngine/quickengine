import {
	and,
	clientRecords,
	db,
	eq,
	quickengineWorkspaces,
} from "@quickengine/db";
import { z } from "zod";

const optionalText = (maximum: number) =>
	z.preprocess(
		(value) =>
			typeof value === "string" && value.trim() === "" ? null : value,
		z.string().trim().max(maximum).nullable().optional(),
	);

export const clientRecordInputSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.preprocess(
		(value) =>
			typeof value === "string" && value.trim() === "" ? null : value,
		z.string().trim().email().max(320).nullable().optional(),
	),
	phone: optionalText(50),
	company: optionalText(200),
	notes: optionalText(10_000),
	fields: z
		.record(z.string().trim().min(1).max(64), z.string().max(1_000))
		.refine((fields) => Object.keys(fields).length <= 50, {
			message: "A client record can have at most 50 custom fields.",
		})
		.optional(),
});

export const clientRecordPatchSchema = clientRecordInputSchema
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one client field is required.",
	});

export type ClientRecordInput = z.input<typeof clientRecordInputSchema>;
export type ClientRecordPatch = z.input<typeof clientRecordPatchSchema>;

// Client records are deliberately unmetered. Future plan limits may cap record count,
// but creating a customer is never itself a billable business outcome.
export async function createClientRecord(
	workspaceId: string,
	input: ClientRecordInput,
) {
	const values = clientRecordInputSchema.parse(input);
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
			name: values.name,
			email: values.email ?? null,
			phone: values.phone ?? null,
			company: values.company ?? null,
			notes: values.notes ?? null,
			fields: values.fields ?? {},
		})
		.returning();
	return record;
}

export async function listClientRecords(workspaceId: string) {
	return db
		.select()
		.from(clientRecords)
		.where(eq(clientRecords.workspaceId, workspaceId))
		.orderBy(clientRecords.name, clientRecords.createdAt);
}

export async function getClientRecord(workspaceId: string, id: string) {
	const [record] = await db
		.select()
		.from(clientRecords)
		.where(
			and(eq(clientRecords.workspaceId, workspaceId), eq(clientRecords.id, id)),
		)
		.limit(1);
	return record;
}

export async function updateClientRecord(
	workspaceId: string,
	id: string,
	patch: ClientRecordPatch,
) {
	const values = clientRecordPatchSchema.parse(patch);
	const [record] = await db
		.update(clientRecords)
		.set({ ...values, updatedAt: new Date() })
		.where(
			and(eq(clientRecords.workspaceId, workspaceId), eq(clientRecords.id, id)),
		)
		.returning();
	return record;
}

export async function deleteClientRecord(workspaceId: string, id: string) {
	const [record] = await db
		.delete(clientRecords)
		.where(
			and(eq(clientRecords.workspaceId, workspaceId), eq(clientRecords.id, id)),
		)
		.returning({ id: clientRecords.id });
	return record;
}
