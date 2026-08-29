import {
	claimNextCycle,
	createOrder,
	dueSubscriptions,
	priceCheckout,
	readOrdersSettings,
	SubscriptionError,
	settleCycle,
} from "@quickengine/mod-orders";

/**
 * Turn due subscriptions into real orders.
 *
 * ── Why this is a cron and not an event handler ──────────────────────────────
 *
 * Nothing HAPPENS when a subscription falls due — the passage of time is not an
 * event anybody emits. So the only durable trigger is the clock, and the
 * database is the record of what is owed. A missed run is recovered by the next
 * one, because `dueSubscriptions` asks for everything overdue rather than
 * everything due exactly now.
 *
 * 🔴 Safety comes from `claimNextCycle`, not from this loop. Claiming inserts a
 * cycle row keyed on `(subscription_id, period_start)`, which is unique — so two
 * overlapping runs cannot both charge the same month. That is what makes it
 * acceptable to run every minute and to retry freely.
 *
 * ⚠️ One failure never stops the batch. A subscription whose catalog item was
 * deleted must not prevent every other business's renewals from going out.
 */
export async function renewDueSubscriptions(): Promise<{
	claimed: number;
	ordered: number;
	failed: number;
}> {
	const due = await dueSubscriptions();
	let claimed = 0;
	let ordered = 0;
	let failed = 0;

	for (const subscription of due) {
		const cycle = await claimNextCycle(subscription.id);
		// Another run got there first, or the plan vanished. Both are fine.
		if (!cycle) continue;
		claimed += 1;

		try {
			if (cycle.contents.length === 0) {
				throw new SubscriptionError("SUBSCRIPTION_PLAN_EMPTY");
			}
			/**
			 * 🔴 Priced NOW, from the catalog, not from the plan's stored price.
			 *
			 * The plan price governs the agreement; the order records what was
			 * actually sent this month. Reusing a price captured at signup would
			 * mean a box whose contents changed silently charging last year's
			 * amount — and `createOrder` requires real per-line prices anyway,
			 * because an order is a financial record, not a reference.
			 */
			const priced = await priceCheckout(
				subscription.workspaceId,
				cycle.contents.map(
					(line: { catalogItemId: string; quantity: number }) => ({
						catalogItemId: line.catalogItemId,
						quantity: line.quantity,
					}),
				),
			);
			// The business's own prefix, same as a checkout order — a renewal that
			// numbered itself differently would look like a different shop.
			const { numberPrefix } = await readOrdersSettings(
				subscription.workspaceId,
			);
			const order = await createOrder(subscription.workspaceId, {
				clientId: cycle.subscription.customerId,
				currency: priced.currency,
				lines: priced.lines,
				numberPrefix,
			});

			/**
			 * 🔴 The renewal CHARGES. Until this existed the engine created an order
			 * and stopped — a subscription took a customer's details, promised them
			 * coffee every month, and never took a penny after the first box. The
			 * cycle was even marked "charged".
			 *
			 * ⚠️ Off-session: nobody is at a browser. A bank that wants the customer
			 * to approve refuses instead, and that refusal is recorded on the cycle
			 * so somebody can ask them to come back — rather than retried blindly
			 * against a card that will keep saying no.
			 */
			await chargeRenewal({
				workspaceId: subscription.workspaceId,
				subscriptionId: subscription.id,
				order,
				currency: priced.currency,
			});

			await settleCycle({
				subscriptionId: subscription.id,
				periodStart: cycle.periodStart,
				orderId: order.id,
			});
			ordered += 1;
		} catch (error) {
			/**
			 * 🔴 Recorded against the CYCLE, never thrown away.
			 *
			 * A renewal that failed silently is a customer who stops receiving
			 * coffee and a business that never finds out. The reason is stored for
			 * the operator; `settleCycle` decides whether this counts as past due
			 * or as the end of the subscription.
			 */
			const settled = await settleCycle({
				subscriptionId: subscription.id,
				periodStart: cycle.periodStart,
				failureReason:
					error instanceof Error ? error.message : "RENEWAL_FAILED",
			});

			/**
			 * 🔴 TELL THE CUSTOMER. This is the whole reason `past_due` exists.
			 *
			 * `settleCycle` keeps a failed renewal alive rather than cancelling it,
			 * on the reasoning that somebody whose card expired still wants the
			 * coffee and would fix it given the chance. Nothing gave them that
			 * chance: the subscription quietly went past due, then quietly ended,
			 * and the first they knew was that the coffee stopped coming.
			 *
			 * ⚠️ Never allowed to fail the cycle. The renewal outcome is already
			 * recorded; a mail outage must not make the run look like it failed and
			 * re-charge somebody on the next pass.
			 */
			try {
				await tellCustomerPaymentFailed(subscription, settled.status);
			} catch (mailError) {
				console.error("subscription-renewal.notice_failed", {
					error: mailError,
					subscriptionId: subscription.id,
				});
			}
			failed += 1;
		}
	}

	return { claimed, ordered, failed };
}

/**
 * Take the money for a renewal, with nobody present.
 *
 * ── Why this is separate from the loop ───────────────────────────────────────
 *
 * 🔴 A renewal that cannot be charged is not a crash — it is a customer whose
 * card expired. So every failure returns rather than throwing, and the caller
 * records it against the cycle where an operator can see it. Throwing would
 * abandon the rest of the batch for one dead card.
 *
 * ⚠️ Reuses the ordinary checkout settlement path. The provider webhook that
 * confirms this charge is the SAME one a shop checkout uses, so a renewal
 * settles, notifies and hands off to suppliers exactly like any other order.
 * A separate path would be a second implementation of the most important
 * transaction in the product.
 */
async function chargeRenewal(input: {
	workspaceId: string;
	subscriptionId: string;
	order: {
		id: string;
		number: string;
		totalCents: number;
		clientId: string | null;
	};
	currency: string;
}): Promise<void> {
	const { subscriptionChargeable } = await import("@quickengine/mod-orders");
	const saved = await subscriptionChargeable(input.subscriptionId);
	if (!saved) {
		/**
		 * ⚠️ A sentence, not a code. This lands on the cycle's `failureReason`,
		 * which an OPERATOR reads in the dashboard — it never crosses an HTTP
		 * boundary and has no error map to translate it.
		 */
		throw new Error(
			"No saved payment method, so nothing could be charged. The customer needs to enter their card again.",
		);
	}

	const {
		getPaymentAccount,
		getPaymentProvider,
		recordPendingCheckoutPayment,
	} = await import("@quickengine/mod-payments");
	const account = await getPaymentAccount(input.workspaceId);
	if (!account?.externalAccountId) {
		throw new Error(
			"This workspace has no connected payment account, so the renewal could not be charged.",
		);
	}

	const { workspaceEnvironment } = await import("@quickengine/db");
	const environment = await workspaceEnvironment(input.workspaceId);

	const charge = await getPaymentProvider(account.provider).createCharge({
		environment,
		amountCents: input.order.totalCents,
		currency: input.currency,
		connectedAccountId: account.externalAccountId,
		// Same rule as checkout: meter infrastructure, never a business outcome.
		applicationFeeCents: 0,
		metadata: {
			orderId: input.order.id,
			orderNumber: input.order.number,
			workspaceId: input.workspaceId,
			subscriptionId: input.subscriptionId,
		},
		offSession: saved,
	});

	/**
	 * 🔴 The row that lets the provider's webhook find this order. Without it the
	 * confirmation arrives signed and valid with nowhere to apply itself, and the
	 * customer is charged for an order that stays a draft for ever.
	 */
	await recordPendingCheckoutPayment({
		workspaceId: input.workspaceId,
		orderId: input.order.id,
		clientId: input.order.clientId,
		clientEmail: null,
		externalPaymentId: charge.externalPaymentId,
		provider: account.provider,
		amountCents: input.order.totalCents,
		currency: input.currency,
		environment,
	});
}

/**
 * Ask a customer to fix the card behind their subscription, or tell them it has
 * ended.
 *
 * ⚠️ Sent from the BUSINESS, never the platform. A subscriber has a
 * relationship with the shop they bought from and none at all with QuickEngine,
 * so this fails closed on the sender exactly as the purchase order does.
 */
async function tellCustomerPaymentFailed(
	subscription: {
		id: string;
		workspaceId: string;
		customerId?: string | null;
		planId?: string | null;
	},
	outcome: "active" | "past_due" | "cancelled",
): Promise<void> {
	// `active` means the charge succeeded after all; there is nothing to say.
	if (outcome === "active") return;

	const [
		{ and, clientRecords, db, eq, resolveBrand, subscriptionPlans },
		{ getEmailProvider },
	] = await Promise.all([
		import("@quickengine/db"),
		import("@quickengine/email"),
	]);

	const brand = await resolveBrand(subscription.workspaceId);
	if (!brand?.sender) return;

	if (!subscription.customerId) return;
	const [customer] = await db
		.select({ email: clientRecords.email })
		.from(clientRecords)
		.where(
			and(
				eq(clientRecords.workspaceId, subscription.workspaceId),
				eq(clientRecords.id, subscription.customerId),
			),
		)
		.limit(1);
	if (!customer?.email) return;

	const { readEmailTemplateCopy } = await import("@quickengine/db");
	const copy = await readEmailTemplateCopy(subscription.workspaceId);
	/**
	 * ⚠️ The plan's real name. "Your subscription subscription has ended" is the
	 * kind of sentence that tells a customer nobody read this before sending it.
	 */
	const [plan] = subscription.planId
		? await db
				.select({ name: subscriptionPlans.name })
				.from(subscriptionPlans)
				.where(
					and(
						eq(subscriptionPlans.workspaceId, subscription.workspaceId),
						eq(subscriptionPlans.id, subscription.planId),
					),
				)
				.limit(1)
		: [];

	const { subscriptionPaymentFailedEmail } = await import(
		"@quickengine/email/templates"
	);
	const rendered = subscriptionPaymentFailedEmail({
		brand,
		copy: copy["subscription-payment-failed"],
		planName: plan?.name ?? "subscription",
		outcome,
	});

	await getEmailProvider().send({
		to: customer.email,
		from: brand.sender,
		replyTo: brand.supportEmail,
		subject: rendered.subject,
		html: rendered.html,
		text: rendered.text,
	});
}
