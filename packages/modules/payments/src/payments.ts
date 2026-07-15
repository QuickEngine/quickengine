import {
	and,
	clientRecords,
	db,
	eq,
	invoices,
	paymentAccounts,
	paymentRefunds,
	payments,
	quickengineWorkspaces,
	sql,
} from "@quickengine/db";
import { z } from "zod";
import { canTransition, type PaymentStatus } from "./status";

const MAX_MONEY_CENTS = 2_000_000_000;
const currencySchema = z
	.string()
	.trim()
	.length(3)
	.transform((value) => value.toUpperCase());

export const recordPaymentInputSchema = z.object({
	invoiceId: z.string().uuid().nullable().optional(),
	clientId: z.string().uuid().nullable().optional(),
	amountCents: z.number().int().min(1).max(MAX_MONEY_CENTS),
	currency: currencySchema.optional(),
	applicationFeeCents: z.number().int().min(0).max(MAX_MONEY_CENTS).optional(),
	provider: z.string().trim().min(1).max(50).optional(),
	paymentMethod: z.string().trim().min(1).max(50).optional(),
	externalPaymentId: z.string().trim().min(1).max(255).nullable().optional(),
	stripePaymentIntentId: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.nullable()
		.optional(),
	reference: z.string().trim().max(255).nullable().optional(),
	notes: z.string().trim().max(10_000).nullable().optional(),
	status: z.enum(["pending", "processing", "succeeded", "failed"]).optional(),
});

export type RecordPaymentInput = z.input<typeof recordPaymentInputSchema>;

export const refundPaymentInputSchema = z.object({
	amountCents: z.number().int().min(1).max(MAX_MONEY_CENTS),
	externalRefundId: z.string().trim().min(1).max(255).nullable().optional(),
	reason: z.string().trim().max(1_000).nullable().optional(),
});

export type RefundPaymentInput = z.input<typeof refundPaymentInputSchema>;
type PaymentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The workspace's connected payment account (or undefined). */
export async function getPaymentAccount(workspaceId: string) {
	const [account] = await db
		.select()
		.from(paymentAccounts)
		.where(eq(paymentAccounts.workspaceId, workspaceId))
		.limit(1);
	return account;
}

export type PaymentAccountPatch = {
	stripeAccountId?: string | null;
	status?: "pending" | "active" | "restricted" | "disabled";
	chargesEnabled?: boolean;
	payoutsEnabled?: boolean;
};

export async function upsertPaymentAccount(
	workspaceId: string,
	patch: PaymentAccountPatch,
) {
	const existing = await getPaymentAccount(workspaceId);
	if (existing) {
		const [updated] = await db
			.update(paymentAccounts)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(paymentAccounts.workspaceId, workspaceId))
			.returning();
		return updated;
	}
	const [created] = await db
		.insert(paymentAccounts)
		.values({ workspaceId, ...patch })
		.returning();
	return created;
}

async function reconcileInvoice(
	tx: PaymentTransaction,
	workspaceId: string,
	invoiceId: string,
	now: Date,
) {
	const [invoice] = await tx
		.select()
		.from(invoices)
		.where(
			and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
		)
		.limit(1)
		.for("update");
	if (!invoice || invoice.status === "draft" || invoice.status === "void")
		return;

	const [totals] = await tx
		.select({
			collected: sql<number>`coalesce(sum(case when ${payments.status} in ('succeeded', 'refunded') then ${payments.amountCents} else 0 end), 0)::int`,
			refunded: sql<number>`coalesce((select sum(${paymentRefunds.amountCents}) from ${paymentRefunds} where ${paymentRefunds.workspaceId} = ${workspaceId} and ${paymentRefunds.paymentId} in (select ${payments.id} from ${payments} where ${payments.workspaceId} = ${workspaceId} and ${payments.invoiceId} = ${invoiceId})), 0)::int`,
		})
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, workspaceId),
				eq(payments.invoiceId, invoiceId),
			),
		);
	const netCollected =
		Number(totals?.collected ?? 0) - Number(totals?.refunded ?? 0);
	const paid = netCollected >= invoice.totalCents;
	await tx
		.update(invoices)
		.set({
			status: paid ? "paid" : "sent",
			paidAt: paid ? now : null,
			updatedAt: now,
		})
		.where(
			and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
		);
}

// Records money without metering a business outcome. Offline methods use provider
// "manual"; provider integrations supply stable external IDs for idempotency.
export async function recordPayment(
	workspaceId: string,
	input: RecordPaymentInput,
) {
	const values = recordPaymentInputSchema.parse(input);
	const now = new Date();
	const initialStatus = values.status ?? "pending";
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1);
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

		let invoice: typeof invoices.$inferSelect | undefined;
		if (values.invoiceId) {
			[invoice] = await tx
				.select()
				.from(invoices)
				.where(
					and(
						eq(invoices.workspaceId, workspaceId),
						eq(invoices.id, values.invoiceId),
					),
				)
				.limit(1)
				.for("update");
			if (!invoice) throw new Error("INVOICE_NOT_FOUND");
			if (invoice.status === "draft" || invoice.status === "void") {
				throw new Error("INVOICE_NOT_PAYABLE");
			}
			if (values.currency && values.currency !== invoice.currency) {
				throw new Error("PAYMENT_CURRENCY_MISMATCH");
			}
			if (initialStatus === "succeeded") {
				const [totals] = await tx
					.select({
						collected: sql<number>`coalesce(sum(case when ${payments.status} in ('succeeded', 'refunded') then ${payments.amountCents} else 0 end), 0)::int`,
						refunded: sql<number>`coalesce((select sum(${paymentRefunds.amountCents}) from ${paymentRefunds} where ${paymentRefunds.workspaceId} = ${workspaceId} and ${paymentRefunds.paymentId} in (select ${payments.id} from ${payments} where ${payments.workspaceId} = ${workspaceId} and ${payments.invoiceId} = ${values.invoiceId})), 0)::int`,
					})
					.from(payments)
					.where(
						and(
							eq(payments.workspaceId, workspaceId),
							eq(payments.invoiceId, values.invoiceId),
						),
					);
				const remaining =
					invoice.totalCents -
					(Number(totals?.collected ?? 0) - Number(totals?.refunded ?? 0));
				if (values.amountCents > remaining) {
					throw new Error("PAYMENT_EXCEEDS_INVOICE_BALANCE");
				}
			}
		}

		const clientId = values.clientId ?? invoice?.clientId ?? null;
		if (
			invoice?.clientId &&
			values.clientId &&
			values.clientId !== invoice.clientId
		) {
			throw new Error("PAYMENT_CLIENT_MISMATCH");
		}
		let client: typeof clientRecords.$inferSelect | undefined;
		if (clientId) {
			[client] = await tx
				.select()
				.from(clientRecords)
				.where(
					and(
						eq(clientRecords.workspaceId, workspaceId),
						eq(clientRecords.id, clientId),
					),
				)
				.limit(1);
			if (!client && !invoice) throw new Error("CLIENT_NOT_FOUND");
		}
		if ((values.applicationFeeCents ?? 0) > values.amountCents) {
			throw new Error("PAYMENT_FEE_INVALID");
		}

		const [payment] = await tx
			.insert(payments)
			.values({
				workspaceId,
				invoiceId: values.invoiceId ?? null,
				clientId,
				clientName: client?.name ?? invoice?.clientName ?? null,
				clientEmail: client?.email ?? invoice?.clientEmail ?? null,
				clientCompany: client?.company ?? invoice?.clientCompany ?? null,
				amountCents: values.amountCents,
				applicationFeeCents: values.applicationFeeCents ?? 0,
				currency: values.currency ?? invoice?.currency ?? "USD",
				status: initialStatus,
				provider: values.provider ?? "stripe",
				paymentMethod: values.paymentMethod ?? "card",
				externalPaymentId: values.externalPaymentId ?? null,
				stripePaymentIntentId: values.stripePaymentIntentId ?? null,
				reference: values.reference ?? null,
				notes: values.notes ?? null,
				succeededAt: initialStatus === "succeeded" ? now : null,
				failedAt: initialStatus === "failed" ? now : null,
				refundedAt: null,
			})
			.returning();
		if (values.invoiceId)
			await reconcileInvoice(tx, workspaceId, values.invoiceId, now);
		return payment;
	});
}

export async function setPaymentStatus(
	workspaceId: string,
	id: string,
	status: PaymentStatus,
	options: { now?: Date } = {},
) {
	const now = options.now ?? new Date();
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(payments)
			.where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("PAYMENT_NOT_FOUND");
		if (current.status === status) throw new Error("PAYMENT_STATUS_UNCHANGED");
		if (!canTransition(current.status as PaymentStatus, status)) {
			throw new Error("PAYMENT_ILLEGAL_TRANSITION");
		}
		if (status === "refunded") {
			const [sum] = await tx
				.select({
					total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::int`,
				})
				.from(paymentRefunds)
				.where(
					and(
						eq(paymentRefunds.workspaceId, workspaceId),
						eq(paymentRefunds.paymentId, id),
					),
				);
			const remainder = current.amountCents - Number(sum?.total ?? 0);
			if (remainder > 0) {
				await tx.insert(paymentRefunds).values({
					workspaceId,
					paymentId: id,
					amountCents: remainder,
					provider: current.provider,
					reason: "Provider reported a full refund",
					createdAt: now,
				});
			}
		}
		const [payment] = await tx
			.update(payments)
			.set({
				status,
				succeededAt: status === "succeeded" ? now : undefined,
				failedAt: status === "failed" ? now : undefined,
				refundedAt: status === "refunded" ? now : undefined,
				updatedAt: now,
			})
			.where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, id)))
			.returning();
		if (current.invoiceId)
			await reconcileInvoice(tx, workspaceId, current.invoiceId, now);
		return payment;
	});
}

export async function refundPayment(
	workspaceId: string,
	id: string,
	input: RefundPaymentInput,
) {
	const values = refundPaymentInputSchema.parse(input);
	const now = new Date();
	return db.transaction(async (tx) => {
		const [payment] = await tx
			.select()
			.from(payments)
			.where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, id)))
			.limit(1)
			.for("update");
		if (!payment) throw new Error("PAYMENT_NOT_FOUND");
		if (payment.status !== "succeeded") {
			throw new Error("PAYMENT_NOT_REFUNDABLE");
		}
		const [sum] = await tx
			.select({
				total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::int`,
			})
			.from(paymentRefunds)
			.where(
				and(
					eq(paymentRefunds.workspaceId, workspaceId),
					eq(paymentRefunds.paymentId, id),
				),
			);
		const refunded = Number(sum?.total ?? 0);
		if (refunded + values.amountCents > payment.amountCents) {
			throw new Error("REFUND_EXCEEDS_PAYMENT");
		}
		const [refund] = await tx
			.insert(paymentRefunds)
			.values({
				workspaceId,
				paymentId: id,
				amountCents: values.amountCents,
				provider: payment.provider,
				externalRefundId: values.externalRefundId ?? null,
				reason: values.reason ?? null,
			})
			.returning();
		const fullyRefunded = refunded + values.amountCents === payment.amountCents;
		await tx
			.update(payments)
			.set({
				status: fullyRefunded ? "refunded" : "succeeded",
				refundedAt: fullyRefunded ? now : null,
				updatedAt: now,
			})
			.where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, id)));
		if (payment.invoiceId)
			await reconcileInvoice(tx, workspaceId, payment.invoiceId, now);
		return refund;
	});
}

export async function getPayment(workspaceId: string, id: string) {
	const [payment] = await db
		.select()
		.from(payments)
		.where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, id)))
		.limit(1);
	if (!payment) return undefined;
	const refunds = await db
		.select()
		.from(paymentRefunds)
		.where(
			and(
				eq(paymentRefunds.workspaceId, workspaceId),
				eq(paymentRefunds.paymentId, id),
			),
		)
		.orderBy(paymentRefunds.createdAt);
	return { ...payment, refunds };
}

export async function listPayments(workspaceId: string) {
	return db
		.select()
		.from(payments)
		.where(eq(payments.workspaceId, workspaceId))
		.orderBy(sql`${payments.createdAt} desc`, sql`${payments.id} desc`);
}
