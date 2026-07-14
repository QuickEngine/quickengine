import {
	clientRecords,
	db,
	eq,
	fulfillments,
	invoices,
	payments,
	quickengineWorkspaces,
} from "@quickengine/db";
import { canTransition, type FulfillmentStatus } from "./status";

export type FulfillmentKind = "physical" | "digital" | "service" | "other";

export type CreateFulfillmentInput = {
	title: string;
	kind?: FulfillmentKind;
	clientId?: string | null;
	invoiceId?: string | null;
	paymentId?: string | null;
	details?: Record<string, unknown>;
	dueAt?: Date | null;
};

async function assertWorkspaceOwnsReference(
	workspaceId: string,
	table: typeof clientRecords | typeof invoices | typeof payments,
	id: string,
	missingError: string,
	mismatchError: string,
) {
	const [record] = await db
		.select({ workspaceId: table.workspaceId })
		.from(table)
		.where(eq(table.id, id))
		.limit(1);
	if (!record) {
		throw new Error(missingError);
	}
	if (record.workspaceId !== workspaceId) {
		throw new Error(mismatchError);
	}
}

/** Create a universal record for delivering what the business promised. */
export async function createFulfillment(
	workspaceId: string,
	input: CreateFulfillmentInput,
) {
	const title = input.title.trim();
	if (!title) {
		throw new Error("FULFILLMENT_TITLE_REQUIRED");
	}

	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
	}

	if (input.clientId) {
		await assertWorkspaceOwnsReference(
			workspaceId,
			clientRecords,
			input.clientId,
			"CLIENT_NOT_FOUND",
			"CLIENT_WORKSPACE_MISMATCH",
		);
	}
	if (input.invoiceId) {
		await assertWorkspaceOwnsReference(
			workspaceId,
			invoices,
			input.invoiceId,
			"INVOICE_NOT_FOUND",
			"INVOICE_WORKSPACE_MISMATCH",
		);
	}
	if (input.paymentId) {
		await assertWorkspaceOwnsReference(
			workspaceId,
			payments,
			input.paymentId,
			"PAYMENT_NOT_FOUND",
			"PAYMENT_WORKSPACE_MISMATCH",
		);
	}

	const [fulfillment] = await db
		.insert(fulfillments)
		.values({
			workspaceId,
			title,
			kind: input.kind ?? "other",
			clientId: input.clientId ?? null,
			invoiceId: input.invoiceId ?? null,
			paymentId: input.paymentId ?? null,
			details: input.details ?? {},
			dueAt: input.dueAt ?? null,
		})
		.returning();
	return fulfillment;
}

/** Move a fulfillment through its deliberately small universal lifecycle. */
export async function setFulfillmentStatus(
	id: string,
	status: FulfillmentStatus,
) {
	const [current] = await db
		.select({ status: fulfillments.status })
		.from(fulfillments)
		.where(eq(fulfillments.id, id))
		.limit(1);
	if (!current) {
		throw new Error("FULFILLMENT_NOT_FOUND");
	}
	if (current.status === status) {
		throw new Error("FULFILLMENT_STATUS_UNCHANGED");
	}
	if (!canTransition(current.status as FulfillmentStatus, status)) {
		throw new Error("FULFILLMENT_ILLEGAL_TRANSITION");
	}

	const now = new Date();
	const [fulfillment] = await db
		.update(fulfillments)
		.set({
			status,
			fulfilledAt: status === "fulfilled" ? now : null,
			updatedAt: now,
		})
		.where(eq(fulfillments.id, id))
		.returning();
	return fulfillment;
}

export async function getFulfillment(id: string) {
	const [fulfillment] = await db
		.select()
		.from(fulfillments)
		.where(eq(fulfillments.id, id))
		.limit(1);
	return fulfillment;
}

export async function listFulfillments(workspaceId: string) {
	return db
		.select()
		.from(fulfillments)
		.where(eq(fulfillments.workspaceId, workspaceId));
}

export async function deleteFulfillment(id: string) {
	const [deleted] = await db
		.delete(fulfillments)
		.where(eq(fulfillments.id, id))
		.returning();
	return deleted;
}
