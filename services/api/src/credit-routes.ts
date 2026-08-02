import {
	CREDIT_PACKS,
	createCreditTopUpIntent,
	MIN_TOPUP_CENTS,
} from "@quickengine/billing";
import {
	creditBalanceMicros,
	getAutoRecharge,
	setAutoRecharge,
} from "@quickengine/db";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeAccount } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * Prepaid credits: balance, top-up, and auto-recharge.
 *
 * 🔴 **These existed with no way to reach them.** `createCreditTopUpIntent`,
 * `getAutoRecharge`, `setAutoRecharge` and `creditBalanceMicros` were all built
 * and exported, and no HTTP route called any of them — so **nobody could buy
 * credits**. `recordTopUp` was reachable only from the Stripe webhook, which can
 * only fire for a checkout that nothing could start. `CLAUDE.md` recorded the
 * whole slice as done.
 *
 * **Behind `billing.manage`, org-scoped.** This is the account's money. A member
 * who can work inside a workspace does not automatically get to spend the
 * company's balance or change a standing authorisation to take payments.
 */

const topUpSchema = z
	.object({
		/** A fixed pack, or a custom amount. Exactly one. */
		pack: z.enum(["small", "medium", "large"]).optional(),
		amountCents: z.coerce.number().int().positive().optional(),
		/**
		 * Store the card for auto-recharge.
		 *
		 * ⚠️ Only ever true by explicit opt-in from the customer. Saving a card by
		 * default is how a top-up quietly becomes a standing authorisation.
		 */
		savePaymentMethod: z.boolean().default(false),
		/** Whose card. Taken from the body, matching `/v1/account/subscription`. */
		billingEmail: z.string().trim().email(),
		billingName: z.string().trim().min(1).max(200).optional(),
	})
	.refine((value) => Boolean(value.pack) !== Boolean(value.amountCents), {
		message: "Choose a pack or an amount, not both.",
	});

const autoRechargeSchema = z.object({
	enabled: z.boolean(),
	/** Recharge when the balance falls below this, in micros. */
	thresholdMicros: z.coerce.number().int().nonnegative().optional(),
	amountCents: z.coerce.number().int().positive().optional(),
});

export function registerCreditRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const billing = authorizeAccount(options.platform, {
		capability: "billing.manage",
	});

	/** The balance, plus what a customer can buy. */
	app.get("/v1/account/credits", billing, async (c) => {
		const organizationId = c.get("account").organizationId;
		const [balanceMicros, autoRecharge] = await Promise.all([
			creditBalanceMicros(organizationId),
			getAutoRecharge(organizationId),
		]);
		return respond(c, {
			balanceMicros,
			packs: CREDIT_PACKS,
			minimumCents: MIN_TOPUP_CENTS,
			autoRecharge: autoRecharge
				? {
						enabled: autoRecharge.enabled,
						thresholdMicros: autoRecharge.thresholdMicros,
						amountCents: autoRecharge.amountCents,
						// Whether a card is stored — never the id, which is a Stripe
						// credential and belongs nowhere near a response.
						hasPaymentMethod: Boolean(autoRecharge.stripePaymentMethodId),
						lastFailureAt: autoRecharge.lastFailureAt,
						lastFailureReason: autoRecharge.lastFailureReason,
					}
				: null,
		});
	});

	/**
	 * Start a top-up.
	 *
	 * Returns a Stripe client secret for Elements. Deliberately not a hosted
	 * checkout: the payment stays inside the product, which is what Asher decided
	 * for the top-up flow.
	 *
	 * ⚠️ Not a durable mutation. Nothing is credited here — `recordTopUp` runs
	 * from the Stripe webhook when the charge actually succeeds. Crediting on
	 * intent creation would hand out balance for payments that never complete.
	 */
	app.post("/v1/account/credits/top-up", billing, async (c) => {
		const account = c.get("account");
		const input = topUpSchema.parse(await c.req.json());
		const pack = input.pack
			? CREDIT_PACKS.find((entry) => entry.id === input.pack)
			: undefined;
		const amountCents = pack?.amountCents ?? input.amountCents ?? 0;

		if (amountCents < MIN_TOPUP_CENTS) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				`The smallest top-up is $${(MIN_TOPUP_CENTS / 100).toFixed(2)}. Below that, card fees take a third of it.`,
				400,
			);
		}

		try {
			const intent = await createCreditTopUpIntent({
				organizationId: account.organizationId,
				billingEmail: input.billingEmail,
				billingName: input.billingName,
				amountCents,
				savePaymentMethod: input.savePaymentMethod,
			});
			return respond(c, { ...intent, amountCents }, 201);
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message === "TOPUP_BELOW_MINIMUM") {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"That top-up is below the minimum.",
					400,
				);
			}
			// Stripe unconfigured or unreachable. A billing outage must read as one.
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				"Payments are unavailable right now. Nothing was charged.",
				503,
			);
		}
	});

	/**
	 * Turn auto-recharge on or off.
	 *
	 * 🔴 A standing authorisation to take money, so enabling it requires BOTH
	 * numbers explicitly. Defaulting a threshold or an amount would mean an
	 * accidental click authorises an unspecified recurring charge.
	 */
	app.put("/v1/account/credits/auto-recharge", billing, async (c) => {
		const organizationId = c.get("account").organizationId;
		const input = autoRechargeSchema.parse(await c.req.json());

		if (input.enabled) {
			if (!input.thresholdMicros || !input.amountCents) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"Turning on auto-recharge needs both a balance to trigger at and an amount to add.",
					400,
				);
			}
			if (input.amountCents < MIN_TOPUP_CENTS) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					`Auto-recharge must add at least $${(MIN_TOPUP_CENTS / 100).toFixed(2)}.`,
					400,
				);
			}
		}

		const saved = await setAutoRecharge({
			organizationId,
			enabled: input.enabled,
			thresholdMicros: input.thresholdMicros,
			amountCents: input.amountCents,
			// Turning it off clears the recorded failure, so re-enabling does not
			// present a stale reason from weeks ago.
			lastFailureAt: input.enabled ? undefined : null,
			lastFailureReason: input.enabled ? undefined : null,
		});

		return respond(c, {
			enabled: saved.enabled,
			thresholdMicros: saved.thresholdMicros,
			amountCents: saved.amountCents,
			hasPaymentMethod: Boolean(saved.stripePaymentMethodId),
		});
	});
}
