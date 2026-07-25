import {
	and,
	clientRecords,
	db,
	eq,
	quickengineWorkspaces,
} from "@quickengine/db";
import { z } from "zod";

// The actor (user id or api-key id) behind a write, threaded from the caller so the
// emitted domain event — and therefore the audit log — can answer "who did it".
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
//
// Writes live in `application.ts` as durable commands: they commit the row, its audit
// entry, and its outbox event in one transaction. The plain read helpers stay here.

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
