import {
	db,
	eq,
	invoices,
	paymentAccounts,
	payments,
	quickengineWorkspaces,
} from "@quickengine/db";
import { setInvoiceStatus } from "@quickengine/mod-invoicing";
import { canTransition, type PaymentStatus } from "./status";

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

/**
 * Create or update the workspace's connected account row. Called when onboarding
 * starts and whenever Stripe's `account.updated` webhook reports new capabilities.
 */
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

export type RecordPaymentInput = {
	invoiceId?: string | null;
	clientId?: string | null;
	amountCents: number;
	currency?: string;
	// QuickEngine's cut, precomputed by the caller via `applicationFeeCents()`.
	applicationFeeCents?: number;
	stripePaymentIntentId?: string | null;
	status?: PaymentStatus;
};

// Record a payment. NOT metered — getting paid is not billable infrastructure.
export async function recordPayment(
	workspaceId: string,
	input: RecordPaymentInput,
) {
	const now = new Date();
	const initialStatus = input.status ?? "pending";
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
	}

	if (input.amountCents <= 0) {
		throw new Error("PAYMENT_AMOUNT_INVALID");
	}

	// Tenant isolation: a payment may only settle an invoice in the same workspace.
	if (input.invoiceId) {
		const [invoice] = await db
			.select({ workspaceId: invoices.workspaceId })
			.from(invoices)
			.where(eq(invoices.id, input.invoiceId))
			.limit(1);
		if (!invoice) {
			throw new Error("INVOICE_NOT_FOUND");
		}
		if (invoice.workspaceId !== workspaceId) {
			throw new Error("INVOICE_WORKSPACE_MISMATCH");
		}
	}

	const [payment] = await db
		.insert(payments)
		.values({
			workspaceId,
			invoiceId: input.invoiceId ?? null,
			clientId: input.clientId ?? null,
			amountCents: input.amountCents,
			applicationFeeCents: input.applicationFeeCents ?? 0,
			currency: input.currency ?? "USD",
			status: initialStatus,
			stripePaymentIntentId: input.stripePaymentIntentId ?? null,
			succeededAt:
				initialStatus === "succeeded" || initialStatus === "refunded"
					? now
					: null,
			failedAt: initialStatus === "failed" ? now : null,
			refundedAt: initialStatus === "refunded" ? now : null,
		})
		.returning();
	return payment;
}

/**
 * Move a payment to a new status (typically driven by a Stripe webhook). On
 * `succeeded`, reconciles the linked invoice to `paid`. The payment record is the
 * source of truth for the money, so a reconciliation that can't apply (invoice
 * already paid, or voided) is swallowed rather than failing the payment update.
 */
export async function setPaymentStatus(
	id: string,
	status: PaymentStatus,
	options: { now?: Date } = {},
) {
	const now = options.now ?? new Date();
	const [current] = await db
		.select({
			status: payments.status,
			invoiceId: payments.invoiceId,
		})
		.from(payments)
		.where(eq(payments.id, id))
		.limit(1);
	if (!current) {
		throw new Error("PAYMENT_NOT_FOUND");
	}
	if (current.status === status) {
		throw new Error("PAYMENT_STATUS_UNCHANGED");
	}
	if (!canTransition(current.status as PaymentStatus, status)) {
		throw new Error("PAYMENT_ILLEGAL_TRANSITION");
	}

	const [payment] = await db
		.update(payments)
		.set({
			status,
			succeededAt: status === "succeeded" ? now : undefined,
			failedAt: status === "failed" ? now : undefined,
			refundedAt: status === "refunded" ? now : undefined,
			updatedAt: now,
		})
		.where(eq(payments.id, id))
		.returning();

	if (status === "succeeded" && current.invoiceId) {
		try {
			await setInvoiceStatus(payment.workspaceId, current.invoiceId, "paid", {
				now,
			});
		} catch {
			// Invoice already paid/void or not transitionable — money is recorded either
			// way; invoice status is a best-effort reflection of it.
		}
	}

	return payment;
}

/** All payments in a workspace. */
export async function listPayments(workspaceId: string) {
	return db
		.select()
		.from(payments)
		.where(eq(payments.workspaceId, workspaceId));
}
