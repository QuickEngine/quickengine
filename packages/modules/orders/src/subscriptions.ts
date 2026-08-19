import {
	and,
	asc,
	catalogItems,
	db,
	eq,
	inArray,
	isNotNull,
	isNull,
	lte,
	subscriptionCycles,
	subscriptionPlanItems,
	subscriptionPlans,
	subscriptions,
} from "@quickengine/db";
import { z } from "zod";

/**
 * Recurring purchases — the customer's revenue, never QuickEngine's.
 *
 * ── Scope of this file ───────────────────────────────────────────────────────
 *
 * Plans, and turning one into a live subscription with its first order. The
 * renewal engine is deliberately NOT here: a cycle after the first is a
 * scheduled charge against a stored payment method, which is a different problem
 * with different failure modes (dunning, expired cards, a scheduler running
 * twice). Shipping the purchase path first means the whole flow can be rehearsed
 * end to end before anything runs unattended.
 *
 * 🔴 Hard rule 7: this must never be metered per active subscription. A business
 * earning more is not QuickEngine costing more.
 */

export const subscriptionPlanInputSchema = z.object({
	name: z.string().trim().min(1).max(200),
	interval: z.enum(["week", "month", "year"]),
	intervalCount: z.number().int().min(1).max(52).default(1),
	priceCents: z.number().int().min(0),
	currency: z.string().trim().length(3).default("USD"),
	trialDays: z.number().int().min(0).max(365).nullish(),
	/** What is in the box. One row per product; two bags is `quantity: 2`. */
	items: z
		.array(
			z.object({
				catalogItemId: z.uuid(),
				quantity: z.number().int().min(1).max(100).default(1),
			}),
		)
		.min(1)
		.max(50),
});

export type SubscriptionPlanInput = z.infer<typeof subscriptionPlanInputSchema>;

export class SubscriptionError extends Error {
	constructor(public readonly code: string) {
		super(code);
		this.name = "SubscriptionError";
	}
}

/** Plans a shopper can subscribe to, with their contents. */
export async function listSubscriptionPlans(workspaceId: string) {
	const plans = await db
		.select()
		.from(subscriptionPlans)
		.where(
			and(
				eq(subscriptionPlans.workspaceId, workspaceId),
				isNull(subscriptionPlans.archivedAt),
			),
		)
		.orderBy(asc(subscriptionPlans.priceCents));
	if (plans.length === 0) return [];

	const contents = await db
		.select({
			planId: subscriptionPlanItems.planId,
			catalogItemId: subscriptionPlanItems.catalogItemId,
			name: catalogItems.name,
			quantity: subscriptionPlanItems.quantity,
		})
		.from(subscriptionPlanItems)
		.innerJoin(
			catalogItems,
			eq(catalogItems.id, subscriptionPlanItems.catalogItemId),
		)
		.where(eq(subscriptionPlanItems.workspaceId, workspaceId))
		.orderBy(asc(subscriptionPlanItems.position));

	return plans.map((plan) => ({
		...plan,
		items: contents.filter((row) => row.planId === plan.id),
	}));
}

/**
 * Create a plan and its contents together.
 *
 * ⚠️ One transaction. A plan whose contents failed to write is an offering that
 * charges for an empty box, and it would look completely normal in a list.
 */
export async function createSubscriptionPlan(
	workspaceId: string,
	input: SubscriptionPlanInput,
) {
	const values = subscriptionPlanInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const owned = await tx
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(eq(catalogItems.workspaceId, workspaceId));
		const ownedIds = new Set(owned.map((row) => row.id));
		for (const item of values.items) {
			// 🔴 Checked against THIS workspace: a plan must not be able to name
			// another business's product by id.
			if (!ownedIds.has(item.catalogItemId)) {
				throw new SubscriptionError("CATALOG_ITEM_NOT_FOUND");
			}
		}

		const [plan] = await tx
			.insert(subscriptionPlans)
			.values({
				workspaceId,
				name: values.name,
				interval: values.interval,
				intervalCount: values.intervalCount,
				priceCents: values.priceCents,
				currency: values.currency,
				trialDays: values.trialDays ?? null,
			})
			.returning();

		await tx.insert(subscriptionPlanItems).values(
			values.items.map((item, index) => ({
				workspaceId,
				planId: plan.id,
				catalogItemId: item.catalogItemId,
				quantity: item.quantity,
				position: index,
			})),
		);
		return plan;
	});
}

export async function archiveSubscriptionPlan(workspaceId: string, id: string) {
	const [row] = await db
		.update(subscriptionPlans)
		.set({ archivedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(subscriptionPlans.id, id),
				eq(subscriptionPlans.workspaceId, workspaceId),
			),
		)
		.returning();
	if (!row) throw new SubscriptionError("SUBSCRIPTION_PLAN_NOT_FOUND");
	return row;
}

/** When the cycle after this one falls due. */
export function nextRenewal(
	from: Date,
	interval: "week" | "month" | "year",
	count: number,
): Date {
	const next = new Date(from);
	if (interval === "week") next.setDate(next.getDate() + 7 * count);
	if (interval === "month") next.setMonth(next.getMonth() + count);
	if (interval === "year") next.setFullYear(next.getFullYear() + count);
	return next;
}

/**
 * A plan's contents, for pricing, without starting anything.
 *
 * 🔴 Split from `startSubscription` because of ORDER OF OPERATIONS. Checkout has
 * to price the basket before it knows who the customer is — a guest's client
 * record is created from the details they type — but a subscription needs that
 * customer to exist. So the contents are read first to price the order, and the
 * subscription is started afterwards against the real client.
 *
 * Doing both in one call meant creating a subscription for a customer that did
 * not exist yet, which is how you end up with rows nobody can be billed for.
 */
export async function subscriptionPlanContents(
	workspaceId: string,
	planId: string,
) {
	const [plan] = await db
		.select()
		.from(subscriptionPlans)
		.where(
			and(
				eq(subscriptionPlans.id, planId),
				eq(subscriptionPlans.workspaceId, workspaceId),
				isNull(subscriptionPlans.archivedAt),
			),
		)
		.limit(1);
	if (!plan) throw new SubscriptionError("SUBSCRIPTION_PLAN_NOT_FOUND");

	const contents = await db
		.select({
			catalogItemId: subscriptionPlanItems.catalogItemId,
			quantity: subscriptionPlanItems.quantity,
		})
		.from(subscriptionPlanItems)
		.where(eq(subscriptionPlanItems.planId, plan.id))
		.orderBy(asc(subscriptionPlanItems.position));
	if (contents.length === 0) {
		throw new SubscriptionError("SUBSCRIPTION_PLAN_EMPTY");
	}
	return { plan, contents };
}

/**
 * Start a subscription, and open its first cycle.
 *
 * 🔑 Returns the plan's CONTENTS so the caller can place a real order for them.
 * A subscription does not hold items of its own: every cycle produces an
 * ordinary order, and inventory, fulfilment and shipping never learn that
 * subscriptions exist.
 *
 * ⚠️ The first cycle is written in the same transaction, keyed on its period
 * start. That unique key is what makes a retried purchase safe — a second
 * attempt collides rather than charging somebody twice for one month.
 */
export async function startSubscription(input: {
	workspaceId: string;
	planId: string;
	customerId: string;
	environment: "test" | "live";
	destinationId?: string | null;
}) {
	return db.transaction(async (tx) => {
		const [plan] = await tx
			.select()
			.from(subscriptionPlans)
			.where(
				and(
					eq(subscriptionPlans.id, input.planId),
					eq(subscriptionPlans.workspaceId, input.workspaceId),
					isNull(subscriptionPlans.archivedAt),
				),
			)
			.limit(1);
		if (!plan) throw new SubscriptionError("SUBSCRIPTION_PLAN_NOT_FOUND");

		const contents = await tx
			.select({
				catalogItemId: subscriptionPlanItems.catalogItemId,
				quantity: subscriptionPlanItems.quantity,
			})
			.from(subscriptionPlanItems)
			.where(eq(subscriptionPlanItems.planId, plan.id))
			.orderBy(asc(subscriptionPlanItems.position));
		if (contents.length === 0) {
			throw new SubscriptionError("SUBSCRIPTION_PLAN_EMPTY");
		}

		const now = new Date();
		const periodEnd = nextRenewal(now, plan.interval, plan.intervalCount);

		const [subscription] = await tx
			.insert(subscriptions)
			.values({
				workspaceId: input.workspaceId,
				customerId: input.customerId,
				planId: plan.id,
				environment: input.environment,
				status: plan.trialDays ? "trialing" : "active",
				destinationId: input.destinationId ?? null,
				nextRenewalAt: periodEnd,
				startedAt: now,
			})
			.returning();

		await tx.insert(subscriptionCycles).values({
			workspaceId: input.workspaceId,
			subscriptionId: subscription.id,
			periodStart: now,
			periodEnd,
			status: "pending",
		});

		return { subscription, plan, contents };
	});
}

// ── Renewal ─────────────────────────────────────────────────────────────────

/**
 * Subscriptions whose next cycle is due.
 *
 * ⚠️ `lte`, not `eq`: a scheduler that was down for an hour must still find
 * everything it missed. Anything overdue is due.
 */
export async function dueSubscriptions(now: Date = new Date(), limit = 100) {
	return db
		.select({
			id: subscriptions.id,
			workspaceId: subscriptions.workspaceId,
			customerId: subscriptions.customerId,
			planId: subscriptions.planId,
			environment: subscriptions.environment,
			failedAttempts: subscriptions.failedAttempts,
			nextRenewalAt: subscriptions.nextRenewalAt,
		})
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.status, ["active", "past_due", "trialing"]),
				isNotNull(subscriptions.nextRenewalAt),
				lte(subscriptions.nextRenewalAt, now),
			),
		)
		.orderBy(asc(subscriptions.nextRenewalAt))
		.limit(limit);
}

/**
 * How many failures before a subscription stops trying.
 *
 * 🔑 Three, spread over the retry window rather than three in a row: a card
 * declined once is usually a card that works next week, and cancelling on the
 * first failure loses a customer who would happily have paid.
 */
export const MAX_FAILED_ATTEMPTS = 3;

/**
 * Open the next cycle for a subscription.
 *
 * ── The guarantee this provides ──────────────────────────────────────────────
 *
 * 🔴 A cycle is claimed by INSERTING it, and `(subscription_id, period_start)`
 * is unique. Two schedulers running at once, or one retried after a timeout,
 * therefore cannot both proceed: the loser collides and returns null. This is
 * the whole reason renewal is safe to run every minute.
 *
 * ⚠️ Returns the lines to order rather than placing the order itself. Placing it
 * needs pricing, inventory and payment — all of which live above this layer —
 * and burying a sale inside a scheduler helper is how the two get out of step.
 */
export async function claimNextCycle(subscriptionId: string) {
	return db.transaction(async (tx) => {
		const [subscription] = await tx
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, subscriptionId))
			.limit(1)
			.for("update");
		if (!subscription?.nextRenewalAt) return null;

		const [plan] = await tx
			.select()
			.from(subscriptionPlans)
			.where(eq(subscriptionPlans.id, subscription.planId))
			.limit(1);
		if (!plan) return null;

		const periodStart = subscription.nextRenewalAt;
		const periodEnd = nextRenewal(
			periodStart,
			plan.interval,
			plan.intervalCount,
		);

		try {
			await tx.insert(subscriptionCycles).values({
				workspaceId: subscription.workspaceId,
				subscriptionId: subscription.id,
				periodStart,
				periodEnd,
				status: "pending",
			});
		} catch {
			// Somebody else already claimed this period. Not an error.
			return null;
		}

		const contents = await tx
			.select({
				catalogItemId: subscriptionPlanItems.catalogItemId,
				quantity: subscriptionPlanItems.quantity,
			})
			.from(subscriptionPlanItems)
			.where(eq(subscriptionPlanItems.planId, plan.id))
			.orderBy(asc(subscriptionPlanItems.position));

		// Moved forward immediately: a cycle that failed to charge must not be
		// retried every minute for a month. Dunning is a separate, slower path.
		await tx
			.update(subscriptions)
			.set({ nextRenewalAt: periodEnd, updatedAt: new Date() })
			.where(eq(subscriptions.id, subscription.id));

		return { subscription, plan, contents, periodStart, periodEnd };
	});
}

/** Record what happened to a cycle, and what it means for the subscription. */
export async function settleCycle(input: {
	subscriptionId: string;
	periodStart: Date;
	orderId?: string | null;
	failureReason?: string | null;
}) {
	return db.transaction(async (tx) => {
		await tx
			.update(subscriptionCycles)
			.set({
				status: input.failureReason ? "failed" : "charged",
				orderId: input.orderId ?? null,
				failureReason: input.failureReason ?? null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(subscriptionCycles.subscriptionId, input.subscriptionId),
					eq(subscriptionCycles.periodStart, input.periodStart),
				),
			);

		if (!input.failureReason) {
			// 🔑 Success clears the count rather than decrementing it. Three
			// failures spread over a year is not a customer in trouble.
			await tx
				.update(subscriptions)
				.set({ failedAttempts: 0, status: "active", updatedAt: new Date() })
				.where(eq(subscriptions.id, input.subscriptionId));
			return;
		}

		const [current] = await tx
			.select({ failedAttempts: subscriptions.failedAttempts })
			.from(subscriptions)
			.where(eq(subscriptions.id, input.subscriptionId))
			.limit(1);
		const attempts = (current?.failedAttempts ?? 0) + 1;
		await tx
			.update(subscriptions)
			.set({
				failedAttempts: attempts,
				/**
				 * ⚠️ `past_due`, not `cancelled`, until the limit is reached. A card
				 * that failed once is a customer who still wants the coffee, and
				 * treating those the same is how a business loses somebody who would
				 * have updated their card given the chance.
				 */
				status: attempts >= MAX_FAILED_ATTEMPTS ? "cancelled" : "past_due",
				cancelledAt: attempts >= MAX_FAILED_ATTEMPTS ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(subscriptions.id, input.subscriptionId));
	});
}

/** Pause, resume or cancel — the three things a customer actually asks for. */
export async function setSubscriptionStatus(input: {
	workspaceId: string;
	id: string;
	status: "active" | "paused" | "cancelled";
}) {
	const [row] = await db
		.update(subscriptions)
		.set({
			status: input.status,
			cancelledAt: input.status === "cancelled" ? new Date() : null,
			// A paused subscription must not keep coming due; a resumed one must.
			nextRenewalAt:
				input.status === "paused" || input.status === "cancelled"
					? null
					: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(subscriptions.id, input.id),
				eq(subscriptions.workspaceId, input.workspaceId),
			),
		)
		.returning();
	if (!row) throw new SubscriptionError("SUBSCRIPTION_NOT_FOUND");
	return row;
}

/** Every subscription in a workspace, for the operator console. */
export async function listSubscriptions(
	workspaceId: string,
	environment: "test" | "live",
) {
	return db
		.select({
			id: subscriptions.id,
			status: subscriptions.status,
			customerId: subscriptions.customerId,
			planName: subscriptionPlans.name,
			priceCents: subscriptionPlans.priceCents,
			currency: subscriptionPlans.currency,
			interval: subscriptionPlans.interval,
			intervalCount: subscriptionPlans.intervalCount,
			nextRenewalAt: subscriptions.nextRenewalAt,
			failedAttempts: subscriptions.failedAttempts,
			startedAt: subscriptions.startedAt,
		})
		.from(subscriptions)
		.innerJoin(
			subscriptionPlans,
			eq(subscriptionPlans.id, subscriptions.planId),
		)
		.where(
			and(
				eq(subscriptions.workspaceId, workspaceId),
				// Same rule as orders: a rehearsal never appears among real ones.
				eq(subscriptions.environment, environment),
			),
		)
		.orderBy(asc(subscriptions.nextRenewalAt));
}
