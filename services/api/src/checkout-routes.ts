import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	CheckoutError,
	checkoutInputSchema,
	createOrderCommand,
	priceCheckout,
	readOrdersSettings,
	resolveCheckoutClient,
	taxCalculatorFor,
} from "@quickengine/mod-orders";
import {
	getPaymentAccount,
	getPaymentProvider,
	readPaymentAccount,
	recordPendingCheckoutPayment,
} from "@quickengine/mod-payments";
import type { Context, Hono } from "hono";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * `/v1/checkout` — the route a merchant's own website calls to sell something.
 *
 * 🔴 This is the only write reachable with a credential that ships in page
 * source, so it is the most exposed handler in the system. Two properties keep
 * it safe, and both are enforced elsewhere on purpose:
 *
 * 1. **The caller cannot name a price.** `checkoutInputSchema` has no money
 *    field at all; `priceCheckout` reads the catalog inside the workspace scope.
 * 2. **The caller cannot name a buyer.** No `clientId` is accepted — the client
 *    record is resolved from the email being checked out with. The old prototype
 *    accepted one and never checked it belonged to the storefront, which let one
 *    shop attach orders to another shop's customer.
 *
 * Order first, then charge. The order is created as a draft and only becomes
 * `placed` when the provider confirms payment. Charging first and creating
 * afterwards means a failure between the two takes somebody's money with no
 * record of what they bought — the one outcome that cannot be repaired
 * automatically.
 */
export function registerCheckoutRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const access = authorizeWorkspace(options.platform, {
		keyCapability: "checkout:write",
		module: "orders",
		// A session-authenticated operator may also check out — useful for a phone
		// order taken by staff. They need the ordinary write capability for it.
		sessionCapability: "records.write",
	});

	// Its own bucket. A storefront under attack must not exhaust the limiter its
	// operator relies on to run the business.
	const limit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "checkout.write",
	});

	app.post("/v1/checkout", access, limit, async (c: Context<PlatformEnv>) => {
		const parsed = checkoutInputSchema.safeParse(await c.req.json());
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"The checkout could not be read.",
				400,
				parsed.error.issues,
			);
		}

		const { workspaceId } = c.get("authorized");

		let priced: Awaited<ReturnType<typeof priceCheckout>>;
		try {
			priced = await priceCheckout(workspaceId, parsed.data.items);
		} catch (error) {
			if (error instanceof CheckoutError) {
				// 400, not 500. The request named something unbuyable, which is the
				// caller's problem and is expected traffic on a public storefront —
				// a catalog changes while somebody has a page open.
				return respondError(c, "VALIDATION_ERROR", error.message, 400);
			}
			throw error;
		}

		// Tax from the workspace's own settings, never from the request. Whoever
		// computes it, the caller does not.
		const settings = await readOrdersSettings(workspaceId);
		const taxCents = await taxCalculatorFor(settings).calculate({
			subtotalCents: priced.subtotalCents,
			currency: priced.currency,
		});

		const client = await resolveCheckoutClient({
			workspaceId,
			email: parsed.data.email,
			name: parsed.data.name,
		});

		// The durable write: order, idempotency, audit and outbox in one
		// transaction. An idempotency key is honoured if the caller sent one, which
		// is what stops a double-tapped buy button becoming two orders.
		const context = await buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput: { ...parsed.data, subtotalCents: priced.subtotalCents },
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation: "checkout.create",
			requestId: c.get("requestId"),
		});

		const result = await createOrderCommand(
			context,
			{
				clientId: client.id,
				currency: priced.currency,
				taxCents,
				notes: parsed.data.notes ?? null,
				lines: priced.lines.map((line) => ({
					catalogItemId: line.catalogItemId,
					catalogItemVariantId: line.catalogItemVariantId,
					name: line.name,
					type: line.type,
					sku: line.sku,
					quantity: line.quantity,
					unitPriceCents: line.unitPriceCents,
				})),
				metadata: {},
			},
			options.uow,
		);

		// A replayed idempotent request returns the original order rather than
		// creating a second one, which is what makes a double-tapped buy button
		// safe. Conflict and in-progress are handed back as-is.
		if (result.kind !== "success") {
			return respondMutation(c, result);
		}
		const order = result.result;

		// ── Payment ───────────────────────────────────────────────────────────
		// A workspace that has not connected an account can still take the order;
		// it simply cannot be paid online. That is a real case — a business
		// invoicing afterwards, or taking cash on collection — and refusing the
		// order would lose it entirely.
		const account = await readPaymentAccount(workspaceId);
		if (!account.connected || !account.chargesEnabled) {
			return respond(
				c,
				{
					order,
					payment: null,
					// Said plainly so a storefront can show something useful instead of
					// a blank payment step.
					paymentUnavailableReason: account.connected
						? "The business has not finished connecting its payment account."
						: "The business has not connected a payment account.",
				},
				201,
			);
		}

		const stored = await getPaymentAccount(workspaceId);
		const externalAccountId = stored?.stripeAccountId ?? null;
		if (!externalAccountId) {
			return respond(
				c,
				{
					order,
					payment: null,
					paymentUnavailableReason: "No payment account.",
				},
				201,
			);
		}

		const charge = await getPaymentProvider(account.provider).createCharge({
			amountCents: order.totalCents,
			currency: priced.currency,
			connectedAccountId: externalAccountId,
			// Platform fee stays zero until a workspace has one agreed. Metering
			// charges infrastructure, never a business outcome.
			applicationFeeCents: 0,
			metadata: { orderId: order.id, orderNumber: order.number, workspaceId },
		});

		// 🔴 The row that links the provider's payment id to this order. Without it
		// the settlement webhook arrives valid and signed with nowhere to apply
		// itself, and the order stays a draft while the money moves.
		await recordPendingCheckoutPayment({
			workspaceId,
			orderId: order.id,
			clientId: client.id,
			clientEmail: parsed.data.email,
			externalPaymentId: charge.externalPaymentId,
			provider: account.provider,
			amountCents: order.totalCents,
			currency: priced.currency,
		});

		return respond(
			c,
			{
				order,
				payment: {
					externalPaymentId: charge.externalPaymentId,
					// Safe to hand to the browser: it authorises paying THIS intent and
					// nothing else.
					clientSecret: charge.clientSecret,
				},
			},
			201,
		);
	});
}
