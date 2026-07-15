import {
	and,
	clientRecords,
	db,
	eq,
	fulfillments,
	invoices,
	payments,
	quickengineWorkspaces,
	sql,
} from "@quickengine/db";
import { z } from "zod";
import { canTransition, type FulfillmentStatus } from "./status";

export type FulfillmentKind =
	| "physical"
	| "digital"
	| "service"
	| "pickup"
	| "other";
type FulfillmentExecutor = Pick<
	typeof db,
	"select" | "insert" | "update" | "delete"
>;

export const createFulfillmentInputSchema = z
	.object({
		title: z.string().trim().min(1).max(300),
		kind: z
			.enum(["physical", "digital", "service", "pickup", "other"])
			.optional(),
		clientId: z.string().uuid().nullable().optional(),
		invoiceId: z.string().uuid().nullable().optional(),
		paymentId: z.string().uuid().nullable().optional(),
		sourceModule: z.string().trim().min(1).max(100).nullable().optional(),
		sourceRecordId: z.string().uuid().nullable().optional(),
		instructions: z.string().trim().max(10_000).nullable().optional(),
		details: z.record(z.string(), z.unknown()).optional(),
		dueAt: z.date().nullable().optional(),
	})
	.refine(
		(value) => Boolean(value.sourceModule) === Boolean(value.sourceRecordId),
		"Source module and record must be provided together.",
	)
	.superRefine((value, context) => {
		if (JSON.stringify(value.details ?? {}).length > 20_000) {
			context.addIssue({ code: "custom", message: "Details are too large." });
		}
	});

export type CreateFulfillmentInput = z.input<
	typeof createFulfillmentInputSchema
>;

/** Create a universal record for delivering what the business promised. */
export async function createFulfillment(
	workspaceId: string,
	input: CreateFulfillmentInput,
	executor: FulfillmentExecutor = db,
) {
	const values = createFulfillmentInputSchema.parse(input);
	const [workspace] = await executor
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

	let invoice: typeof invoices.$inferSelect | undefined;
	if (values.invoiceId) {
		[invoice] = await executor
			.select()
			.from(invoices)
			.where(
				and(
					eq(invoices.workspaceId, workspaceId),
					eq(invoices.id, values.invoiceId),
				),
			)
			.limit(1);
		if (!invoice) throw new Error("INVOICE_NOT_FOUND");
		if (invoice.status !== "paid") throw new Error("INVOICE_NOT_PAID");
	}

	let payment: typeof payments.$inferSelect | undefined;
	if (values.paymentId) {
		[payment] = await executor
			.select()
			.from(payments)
			.where(
				and(
					eq(payments.workspaceId, workspaceId),
					eq(payments.id, values.paymentId),
				),
			)
			.limit(1);
		if (!payment) throw new Error("PAYMENT_NOT_FOUND");
		if (payment.status !== "succeeded")
			throw new Error("PAYMENT_NOT_SUCCEEDED");
		if (invoice && payment.invoiceId && payment.invoiceId !== invoice.id) {
			throw new Error("PAYMENT_INVOICE_MISMATCH");
		}
	}

	const clientId =
		values.clientId ?? invoice?.clientId ?? payment?.clientId ?? null;
	if (
		invoice?.clientId &&
		values.clientId &&
		invoice.clientId !== values.clientId
	) {
		throw new Error("CLIENT_INVOICE_MISMATCH");
	}
	let client: typeof clientRecords.$inferSelect | undefined;
	if (clientId) {
		[client] = await executor
			.select()
			.from(clientRecords)
			.where(
				and(
					eq(clientRecords.workspaceId, workspaceId),
					eq(clientRecords.id, clientId),
				),
			)
			.limit(1);
		if (!client && !invoice && !payment) throw new Error("CLIENT_NOT_FOUND");
	}

	if (values.sourceModule && values.sourceRecordId) {
		const [existing] = await executor
			.select({ id: fulfillments.id })
			.from(fulfillments)
			.where(
				and(
					eq(fulfillments.workspaceId, workspaceId),
					eq(fulfillments.sourceModule, values.sourceModule),
					eq(fulfillments.sourceRecordId, values.sourceRecordId),
				),
			)
			.limit(1);
		if (existing) throw new Error("FULFILLMENT_SOURCE_EXISTS");
	}

	const [fulfillment] = await executor
		.insert(fulfillments)
		.values({
			workspaceId,
			title: values.title,
			kind: values.kind ?? "other",
			clientId,
			invoiceId: values.invoiceId ?? null,
			paymentId: values.paymentId ?? null,
			clientName:
				client?.name ?? invoice?.clientName ?? payment?.clientName ?? null,
			clientEmail:
				client?.email ?? invoice?.clientEmail ?? payment?.clientEmail ?? null,
			clientCompany:
				client?.company ??
				invoice?.clientCompany ??
				payment?.clientCompany ??
				null,
			invoiceNumber: invoice?.number ?? null,
			sourceModule: values.sourceModule ?? null,
			sourceRecordId: values.sourceRecordId ?? null,
			instructions: values.instructions ?? null,
			details: values.details ?? {},
			dueAt: values.dueAt ?? null,
		})
		.returning();
	return fulfillment;
}

export async function setFulfillmentStatus(
	workspaceId: string,
	id: string,
	status: FulfillmentStatus,
	executor: FulfillmentExecutor = db,
) {
	const [current] = await executor
		.select({ status: fulfillments.status })
		.from(fulfillments)
		.where(
			and(eq(fulfillments.workspaceId, workspaceId), eq(fulfillments.id, id)),
		)
		.limit(1);
	if (!current) throw new Error("FULFILLMENT_NOT_FOUND");
	if (current.status === status)
		throw new Error("FULFILLMENT_STATUS_UNCHANGED");
	if (!canTransition(current.status as FulfillmentStatus, status)) {
		throw new Error("FULFILLMENT_ILLEGAL_TRANSITION");
	}
	const now = new Date();
	const [fulfillment] = await executor
		.update(fulfillments)
		.set({
			status,
			fulfilledAt: status === "fulfilled" ? now : null,
			failedAt: status === "failed" ? now : null,
			cancelledAt: status === "cancelled" ? now : null,
			updatedAt: now,
		})
		.where(
			and(
				eq(fulfillments.workspaceId, workspaceId),
				eq(fulfillments.id, id),
				eq(fulfillments.status, current.status),
			),
		)
		.returning();
	if (!fulfillment) throw new Error("FULFILLMENT_CONCURRENT_UPDATE");
	return fulfillment;
}

export async function getFulfillment(workspaceId: string, id: string) {
	const [fulfillment] = await db
		.select()
		.from(fulfillments)
		.where(
			and(eq(fulfillments.workspaceId, workspaceId), eq(fulfillments.id, id)),
		)
		.limit(1);
	return fulfillment;
}

export async function listFulfillments(workspaceId: string) {
	return db
		.select()
		.from(fulfillments)
		.where(eq(fulfillments.workspaceId, workspaceId))
		.orderBy(sql`${fulfillments.createdAt} desc`, sql`${fulfillments.id} desc`);
}

export async function deleteFulfillment(
	workspaceId: string,
	id: string,
	executor: FulfillmentExecutor = db,
) {
	const [deleted] = await executor
		.delete(fulfillments)
		.where(
			and(
				eq(fulfillments.workspaceId, workspaceId),
				eq(fulfillments.id, id),
				eq(fulfillments.status, "pending"),
			),
		)
		.returning();
	return deleted;
}
