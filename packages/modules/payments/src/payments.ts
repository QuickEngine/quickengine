import {
	and,
	clientRecords,
	db,
	eq,
	invoices,
	orders,
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
	/**
	 * The order this payment settles.
	 *
	 * 🔴 The whole point of this field: a storefront that runs its own payment
	 * provider — PayPal on Gemsutopia, say — creates the order through
	 * `/v1/checkout`, takes the money itself, then records it here. Without
	 * `orderId` the money and the goods sit in two unlinked rows and nothing can
	 * mark the order paid.
	 *
	 * Verified against the workspace before use. A caller naming somebody else's
	 * order gets ORDER_NOT_FOUND, exactly as with `invoiceId`.
	 */
	orderId: z.string().uuid().nullable().optional(),
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
	/**
	 * Whether the goods go back on the shelf.
	 *
	 * 🔴 Defaults to TRUE, because the ordinary refund is a customer changing
	 * their mind and the item coming back. Defaulting to false would have every
	 * business slowly undercount what it can sell, which is the bug this
	 * replaces.
	 *
	 * ⚠️ Set it FALSE for a refund where the goods are gone: damaged in transit,
	 * lost by the carrier, or a goodwill refund where the customer keeps the
	 * item. A system that always restocks invents stock that does not exist,
	 * which is how a business oversells and disappoints the next customer.
	 *
	 * ⚠️ Only a FULL refund restocks. A partial refund carries no line
	 * information — a $5 discount on a $50 order names no item — so there is
	 * nothing to put back and this flag has no effect.
	 */
	restock: z.boolean().optional().default(true),
});

export type RefundPaymentInput = z.input<typeof refundPaymentInputSchema>;
type PaymentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The workspace's connected payment account (or undefined). */
export async function getPaymentAccount(
	workspaceId: string,
	provider?: string,
) {
	const [account] = await db
		.select()
		.from(paymentAccounts)
		.where(
			provider
				? and(
						eq(paymentAccounts.workspaceId, workspaceId),
						eq(paymentAccounts.provider, provider),
					)
				: and(
						eq(paymentAccounts.workspaceId, workspaceId),
						eq(paymentAccounts.isDefault, true),
					),
		)
		.limit(1);
	return account;
}

/**
 * The account a provider event or charge belongs to, found by provider identity.
 *
 * 🔑 Needed by providers a business connects with its OWN credentials: the only
 * thing a charge or refund carries is the connected account id, and the secrets
 * to make that call live on the row. Scoped by provider AND environment so a
 * sandbox identity can never resolve a live account.
 */
export async function getPaymentAccountByExternalId(
	externalAccountId: string,
	provider: string,
	environment: "test" | "live",
) {
	const [account] = await db
		.select()
		.from(paymentAccounts)
		.where(
			and(
				eq(paymentAccounts.externalAccountId, externalAccountId),
				eq(paymentAccounts.provider, provider),
				eq(paymentAccounts.environment, environment),
			),
		)
		.limit(1);
	return account;
}

export type PaymentAccountPatch = {
	environment?: "test" | "live";
	externalAccountId?: string | null;
	isDefault?: boolean;
	status?: "pending" | "active" | "restricted" | "disabled";
	chargesEnabled?: boolean;
	payoutsEnabled?: boolean;
	/**
	 * Already-encrypted credentials. Never plaintext.
	 *
	 * 🔴 The ciphertext is produced by `encryptProviderCredentials` before it
	 * reaches this layer, so no persistence path can accidentally write a raw
	 * secret — there is no code path here that could.
	 */
	credentials?: string | null;
};

export async function upsertPaymentAccount(
	workspaceId: string,
	provider: string,
	patch: PaymentAccountPatch,
) {
	const environment = await workspaceEnvironment(workspaceId);
	if (patch.environment && patch.environment !== environment) {
		throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
	}
	const existing = await getPaymentAccount(workspaceId, provider);
	if (existing) {
		if (existing.environment !== environment) {
			throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
		}
		const [updated] = await db
			.update(paymentAccounts)
			.set({ ...patch, environment, updatedAt: new Date() })
			.where(
				and(
					eq(paymentAccounts.workspaceId, workspaceId),
					eq(paymentAccounts.provider, provider),
				),
			)
			.returning();
		return updated;
	}
	const [created] = await db
		.insert(paymentAccounts)
		.values({ workspaceId, provider, ...patch, environment })
		.returning();
	return created;
}

export async function workspaceEnvironment(
	workspaceId: string,
): Promise<"test" | "live"> {
	const [workspace] = await db
		.select({ environment: quickengineWorkspaces.environment })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
	return workspace.environment;
}

export async function setDefaultPaymentProvider(
	workspaceId: string,
	provider: string,
) {
	return db.transaction(async (tx) => {
		await tx
			.update(paymentAccounts)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(eq(paymentAccounts.workspaceId, workspaceId));
		const [selected] = await tx
			.update(paymentAccounts)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(
				and(
					eq(paymentAccounts.workspaceId, workspaceId),
					eq(paymentAccounts.provider, provider),
				),
			)
			.returning();
		if (!selected) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
		return selected;
	});
}

/**
 * How much an invoice has actually collected, net of refunds.
 *
 * **This is the single definition of "paid so far", and it must stay single.** Three
 * decisions depend on it and they have to agree: whether a new payment would
 * overpay, whether transitioning a pending payment to succeeded would overpay, and
 * whether the invoice is now settled. This formula previously existed twice,
 * character-for-character, in the overpayment guard and in reconciliation — so a
 * change to how a status counts (treating `disputed` differently, say) applied to
 * one copy would silently let money through one check that the other then refused
 * to honour.
 *
 * `succeeded` and `refunded` both count as collected, because a refunded payment
 * *was* received; the refund is subtracted separately from `payment_refunds`. That
 * keeps partial refunds correct instead of discarding the whole payment. `pending`,
 * `processing`, `failed`, and disputed money are deliberately excluded — funds that
 * have not settled must never reduce the balance a customer still owes.
 *
 * Callers are expected to hold a row lock on the invoice, which every one of them
 * does, so two concurrent provider webhooks serialize rather than both reading a
 * stale balance and both passing the guard.
 */
async function invoiceNetCollected(
	tx: PaymentTransaction,
	workspaceId: string,
	invoiceId: string,
): Promise<number> {
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
	return Number(totals?.collected ?? 0) - Number(totals?.refunded ?? 0);
}

/**
 * Reject money that would take an invoice past its total.
 *
 * `amountCents` is the amount about to *become* collected — a new succeeded
 * payment, or a pending one being transitioned. Either way it is not yet counted in
 * the net, so the arithmetic is the same for both callers.
 */
async function assertWithinInvoiceBalance(
	tx: PaymentTransaction,
	workspaceId: string,
	invoiceId: string,
	invoiceTotalCents: number,
	amountCents: number,
): Promise<void> {
	const net = await invoiceNetCollected(tx, workspaceId, invoiceId);
	if (amountCents > invoiceTotalCents - net) {
		throw new Error("PAYMENT_EXCEEDS_INVOICE_BALANCE");
	}
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

	const netCollected = await invoiceNetCollected(tx, workspaceId, invoiceId);
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
/**
 * Find a payment we have already recorded for the same provider identity.
 *
 * Two identifiers can carry it. `external_payment_id` is covered by a unique index
 * on `(provider, environment, external_payment_id)`, but that column is
 * **nullable and Postgres
 * does not collide NULLs** — so before migration `0042` a Stripe webhook that
 * populated only the payment intent had nothing stopping it inserting a duplicate.
 * `payments_stripe_intent_unique` closes that, and this lookup turns the collision
 * into a replay instead of an error.
 */
async function findPaymentByProviderIdentity(
	tx: PaymentTransaction,
	workspaceId: string,
	values: {
		environment: "test" | "live";
		provider?: string;
		externalPaymentId?: string | null;
		stripePaymentIntentId?: string | null;
	},
) {
	if (values.externalPaymentId) {
		const [existing] = await tx
			.select()
			.from(payments)
			.where(
				and(
					eq(payments.workspaceId, workspaceId),
					eq(payments.provider, values.provider ?? "stripe"),
					eq(payments.environment, values.environment),
					eq(payments.externalPaymentId, values.externalPaymentId),
				),
			)
			.limit(1);
		if (existing) return existing;
	}
	if (values.stripePaymentIntentId) {
		const [existing] = await tx
			.select()
			.from(payments)
			.where(
				and(
					eq(payments.workspaceId, workspaceId),
					eq(payments.stripePaymentIntentId, values.stripePaymentIntentId),
				),
			)
			.limit(1);
		if (existing) return existing;
	}
	return undefined;
}

/** Postgres unique-violation. Two concurrent deliveries can still race the lookup. */
const isUniqueViolation = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: string }).code === "23505";

export async function recordPaymentInTx(
	tx: PaymentTransaction,
	workspaceId: string,
	input: RecordPaymentInput,
) {
	const values = recordPaymentInputSchema.parse(input);
	const now = new Date();
	const initialStatus = values.status ?? "pending";
	{
		const [workspace] = await tx
			.select({
				id: quickengineWorkspaces.id,
				environment: quickengineWorkspaces.environment,
			})
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1);
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

		// A provider that already told us about this payment gets the original answer
		// back, not a second payment row and not a 500. Stripe retries webhooks
		// routinely, so "we have seen this one" is a normal case rather than an error.
		//
		// Checked before the balance guard deliberately: a replay adds no money, so
		// re-running the overpayment check against it would reject a duplicate
		// delivery of a payment that was legitimately accepted the first time.
		const replayed = await findPaymentByProviderIdentity(tx, workspaceId, {
			...values,
			environment: workspace.environment,
		});
		if (replayed) return replayed;

		// Scoped by workspace, and locked, for the same reason the invoice is:
		// two providers confirming the same order concurrently must serialise
		// rather than both deciding it is unpaid.
		let order: typeof orders.$inferSelect | undefined;
		if (values.orderId) {
			[order] = await tx
				.select()
				.from(orders)
				.where(
					and(
						eq(orders.workspaceId, workspaceId),
						eq(orders.id, values.orderId),
					),
				)
				.limit(1)
				.for("update");
			if (!order) throw new Error("ORDER_NOT_FOUND");
			if (order.status === "cancelled") throw new Error("ORDER_NOT_PAYABLE");
			if (values.currency && values.currency !== order.currency) {
				throw new Error("PAYMENT_CURRENCY_MISMATCH");
			}
		}

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
				await assertWithinInvoiceBalance(
					tx,
					workspaceId,
					values.invoiceId,
					invoice.totalCents,
					values.amountCents,
				);
			}
		}

		const clientId =
			values.clientId ?? invoice?.clientId ?? order?.clientId ?? null;
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
				orderId: values.orderId ?? null,
				clientId,
				clientName:
					client?.name ?? invoice?.clientName ?? order?.clientName ?? null,
				// The email matters most: it is what a receipt is sent to, and a guest
				// checkout has one on the order but no client record behind it.
				clientEmail:
					client?.email ?? invoice?.clientEmail ?? order?.clientEmail ?? null,
				clientCompany: client?.company ?? invoice?.clientCompany ?? null,
				amountCents: values.amountCents,
				applicationFeeCents: values.applicationFeeCents ?? 0,
				currency:
					values.currency ?? invoice?.currency ?? order?.currency ?? "USD",
				status: initialStatus,
				provider: values.provider ?? "stripe",
				environment: workspace.environment,
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
	}
}

export async function recordPayment(
	workspaceId: string,
	input: RecordPaymentInput,
) {
	try {
		return await db.transaction((tx) =>
			recordPaymentInTx(tx, workspaceId, input),
		);
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		// Two deliveries of the same webhook raced: both passed the replay lookup, and
		// the index caught the second. A unique violation poisons the whole Postgres
		// transaction, so it cannot be recovered inside `recordPaymentInTx` — the retry
		// has to happen out here, where the losing side now finds the row the winner
		// committed and replays it. Exactly one payment exists either way.
		return await db.transaction((tx) =>
			recordPaymentInTx(tx, workspaceId, input),
		);
	}
}

export async function setPaymentStatusInTx(
	tx: PaymentTransaction,
	workspaceId: string,
	id: string,
	status: PaymentStatus,
	options: { now?: Date } = {},
) {
	const now = options.now ?? new Date();
	{
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
		// Money settling here must clear the same bar as money recorded as settled in
		// the first place. This is the path a provider webhook drives — Stripe reports
		// `payment_intent.succeeded` and a pending payment becomes succeeded — and it
		// previously performed no balance check at all, so a retried or duplicated
		// webhook could take an invoice past its total and leave it over-collected.
		if (status === "succeeded" && current.invoiceId) {
			const [invoice] = await tx
				.select({
					status: invoices.status,
					totalCents: invoices.totalCents,
				})
				.from(invoices)
				.where(
					and(
						eq(invoices.workspaceId, workspaceId),
						eq(invoices.id, current.invoiceId),
					),
				)
				.limit(1)
				.for("update");
			// A void or draft invoice cannot collect. Reconciliation already declines
			// to settle one, so allowing money to land against it would strand a
			// succeeded payment the invoice never accounts for.
			if (!invoice) throw new Error("INVOICE_NOT_FOUND");
			if (invoice.status === "draft" || invoice.status === "void") {
				throw new Error("INVOICE_NOT_PAYABLE");
			}
			await assertWithinInvoiceBalance(
				tx,
				workspaceId,
				current.invoiceId,
				invoice.totalCents,
				current.amountCents,
			);
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
					environment: current.environment,
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
	}
}

export async function setPaymentStatus(
	workspaceId: string,
	id: string,
	status: PaymentStatus,
	options: { now?: Date } = {},
) {
	return db.transaction((tx) =>
		setPaymentStatusInTx(tx, workspaceId, id, status, options),
	);
}

export async function refundPaymentInTx(
	tx: PaymentTransaction,
	workspaceId: string,
	id: string,
	input: RefundPaymentInput,
) {
	const values = refundPaymentInputSchema.parse(input);
	const now = new Date();
	{
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
				environment: payment.environment,
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
	}
}

export async function refundPayment(
	workspaceId: string,
	id: string,
	input: RefundPaymentInput,
) {
	return db.transaction((tx) => refundPaymentInTx(tx, workspaceId, id, input));
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

/** Browser-safe payment state for the customer who owns an order. */
export async function getOrderPaymentSummary(
	workspaceId: string,
	orderId: string,
) {
	const [payment] = await db
		.select({
			id: payments.id,
			amountCents: payments.amountCents,
			currency: payments.currency,
			provider: payments.provider,
			paymentMethod: payments.paymentMethod,
			reference: payments.reference,
			status: payments.status,
			succeededAt: payments.succeededAt,
			refundedAt: payments.refundedAt,
			createdAt: payments.createdAt,
			updatedAt: payments.updatedAt,
		})
		.from(payments)
		.where(
			and(eq(payments.workspaceId, workspaceId), eq(payments.orderId, orderId)),
		)
		.orderBy(sql`${payments.createdAt} desc`, sql`${payments.id} desc`)
		.limit(1);
	if (!payment) return null;
	const refunds = await db
		.select({
			id: paymentRefunds.id,
			amountCents: paymentRefunds.amountCents,
			reason: paymentRefunds.reason,
			createdAt: paymentRefunds.createdAt,
		})
		.from(paymentRefunds)
		.where(
			and(
				eq(paymentRefunds.workspaceId, workspaceId),
				eq(paymentRefunds.paymentId, payment.id),
			),
		)
		.orderBy(paymentRefunds.createdAt);
	return {
		...payment,
		succeededAt: payment.succeededAt?.toISOString() ?? null,
		refundedAt: payment.refundedAt?.toISOString() ?? null,
		createdAt: payment.createdAt.toISOString(),
		updatedAt: payment.updatedAt.toISOString(),
		refunds: refunds.map((refund) => ({
			...refund,
			createdAt: refund.createdAt.toISOString(),
		})),
	};
}

/**
 * Every payment in a workspace, for the mode it is currently in.
 *
 * 🔴 A workspace moves between sandbox and live and back, so it accumulates
 * payments in BOTH. Listing them unfiltered put test cards in the same table as
 * real money, with nothing on the row to tell them apart.
 */
export async function listPayments(workspaceId: string) {
	const environment = await workspaceEnvironment(workspaceId);
	return db
		.select()
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, workspaceId),
				eq(payments.environment, environment),
			),
		)
		.orderBy(sql`${payments.createdAt} desc`, sql`${payments.id} desc`);
}
