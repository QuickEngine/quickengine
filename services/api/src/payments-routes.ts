import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	connectProviderCredentials,
	disconnectPaymentAccount,
	getPaymentDto,
	listPaymentsPage,
	PAYMENT_STATUSES,
	paymentOnboardingInputSchema,
	paymentProviderInputSchema,
	providerCredentialsInputSchema,
	readPaymentAccount,
	recordPaymentCommand,
	refreshPaymentAccount,
	refundAtProvider,
	refundPaymentCommand,
	setDefaultPaymentProvider,
	setPaymentStatusCommand,
	startPaymentOnboarding,
	UnsupportedPaymentProviderError,
} from "@quickengine/mod-payments";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

const uuid = z.uuid();
const statusSchema = z.object({ status: z.enum(PAYMENT_STATUSES) });

/**
 * Is this URL one of our own surfaces?
 *
 * Compared by ORIGIN, never by `startsWith`. A prefix check passes
 * `https://quickdash.xyz.evil.com` and `https://quickdash.xyz@evil.com`, both of
 * which are the attack this guard exists to stop.
 *
 * Localhost is accepted only outside production, so a development convenience
 * cannot become a live redirect target.
 */
export function isOwnOrigin(candidate: string): boolean {
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return false;

	const host = url.hostname.toLowerCase();
	if (host === "quickdash.xyz" || host.endsWith(".quickdash.xyz")) {
		return url.protocol === "https:";
	}
	if (process.env.NODE_ENV !== "production") {
		return host === "localhost" || host === "127.0.0.1";
	}
	return false;
}

export function registerPaymentsRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "payments:read",
		module: "payments",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "payments:write",
		module: "payments",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "payments.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "payments.write",
	});

	const mutationContext = async (
		c: Context<PlatformEnv>,
		operation: string,
		canonicalInput: unknown,
	) =>
		buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput,
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation,
			requestId: c.get("requestId"),
		});

	app.get("/v1/payments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listPaymentsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/payments", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "payments.record", body);
		return respondMutation(
			c,
			await recordPaymentCommand(context, body, options.uow),
		);
	});
	// ── Connect: the business's OWN payment account ─────────────────────────
	//
	// 🔴 Until these existed, `createConnectedAccount`,
	// `createAccountOnboardingLink`, `createDestinationPaymentIntent` and
	// `upsertPaymentAccount` all had ZERO callers — the Connect integration was
	// written and unreachable, so no workspace could connect an account and no
	// customer could ever be charged. See Blocker 1 in
	// `internal/planning/END_TO_END_AUDIT.md`.
	//
	// Everything below goes through the `PaymentProvider` seam, never Stripe
	// directly, so Polar/PayPal/Square are one file each rather than a rewrite.

	/** Our stored view of the account. No network call, safe to poll. */
	app.get("/v1/payments/connect", readAccess, readLimit, async (c) =>
		respond(
			c,
			await readPaymentAccount(
				c.get("authorized").workspaceId,
				c.req.query("provider"),
			),
		),
	);

	/**
	 * Re-read the provider and update our copy.
	 *
	 * Onboarding completes asynchronously — the operator lands back on our page
	 * long before the provider has finished its checks — so whatever we stored
	 * at redirect time is already stale. Rate-limited on the WRITE policy
	 * despite being a refresh, because it makes an outbound API call per hit.
	 */
	/**
	 * Forget the connected account for the mode this workspace is in.
	 *
	 * 🔴 There was no way to do this at all, and `startOnboarding` refuses once
	 * charges are enabled — so a workspace whose connection had become unusable
	 * was stuck with it permanently and the only fix was a DELETE run against the
	 * production database by hand. That happened on 2026-08-23.
	 *
	 * ⚠️ Forgets OUR record, never the account at the provider. The business keeps
	 * its Stripe account, its money and its history; this only stops new charges
	 * being routed through it.
	 */
	app.post(
		"/v1/payments/connect/disconnect",
		writeAccess,
		writeLimit,
		async (c) =>
			respond(
				c,
				await disconnectPaymentAccount(
					c.get("authorized").workspaceId,
					c.req.query("provider"),
				),
			),
	);

	app.post("/v1/payments/connect/refresh", writeAccess, writeLimit, async (c) =>
		respond(
			c,
			await refreshPaymentAccount(
				c.get("authorized").workspaceId,
				c.req.query("provider"),
			),
		),
	);

	app.put(
		"/v1/payments/connect/default",
		writeAccess,
		writeLimit,
		async (c) => {
			const parsed = paymentProviderInputSchema.safeParse(await c.req.json());
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"Choose a supported payment provider.",
					400,
					parsed.error.issues,
				);
			}
			try {
				return respond(
					c,
					await setDefaultPaymentProvider(
						c.get("authorized").workspaceId,
						parsed.data.provider,
					),
				);
			} catch (error) {
				if (/PAYMENT_ACCOUNT_NOT_FOUND/.test(String(error))) {
					return respondError(
						c,
						"NOT_FOUND",
						"That payment provider is not connected.",
						404,
					);
				}
				throw error;
			}
		},
	);

	/**
	 * Start connecting an account.
	 *
	 * Answers with a URL to send the operator to. A provider that is already
	 * active cannot be connected again; pending provider onboarding may be
	 * restarted when its hosted link expires.
	 */
	app.post(
		"/v1/payments/connect/onboard",
		writeAccess,
		writeLimit,
		async (c) => {
			const parsed = paymentOnboardingInputSchema.safeParse(await c.req.json());
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"A valid returnUrl and refreshUrl are required.",
					400,
					parsed.error.issues,
				);
			}

			// 🔴 Open-redirect guard. The provider will send the operator wherever
			// this says, on a page they reached from a payment provider's domain —
			// the most credible phishing setup available against a business owner.
			// Only our own surfaces are acceptable destinations.
			for (const url of [parsed.data.returnUrl, parsed.data.refreshUrl]) {
				if (!isOwnOrigin(url)) {
					return respondError(
						c,
						"VALIDATION_ERROR",
						"returnUrl and refreshUrl must point at a QuickDash surface.",
						400,
					);
				}
			}

			try {
				return respond(
					c,
					await startPaymentOnboarding({
						workspaceId: c.get("authorized").workspaceId,
						...parsed.data,
					}),
				);
			} catch (error) {
				if (/PAYMENT_ACCOUNT_ALREADY_CONNECTED/.test(String(error))) {
					return respondError(
						c,
						"CONFLICT",
						"That payment provider is already connected.",
						409,
					);
				}
				// A provider we have no integration for is the caller's mistake, not a
				// server fault — answering 500 would send them to look at our logs.
				if (error instanceof UnsupportedPaymentProviderError) {
					return respondError(c, "VALIDATION_ERROR", error.message, 400);
				}
				throw error;
			}
		},
	);

	/**
	 * Connect a provider the business owns outright, by supplying its own app
	 * credentials.
	 *
	 * 🔴 The only request in this API whose body is a payment credential.
	 * Consequences, all deliberate:
	 *
	 * · A POST body, never a query string — URLs reach referrers, history and
	 *   proxy logs in a way bodies do not.
	 * · No `mutationContext`, so the payload never becomes a `canonicalInput` in
	 *   `api_audit_events`. An audit row saying credentials were replaced is
	 *   useful; one containing the secret is a second copy of it in a table
	 *   people read.
	 * · The response is a status. Nothing supplied here is ever returned.
	 * · Validation failures do not forward the provider's message, which can
	 *   echo parts of what was sent.
	 */
	app.post(
		"/v1/payments/connect/credentials",
		writeAccess,
		writeLimit,
		async (c) => {
			const parsed = providerCredentialsInputSchema.safeParse(
				await c.req.json(),
			);
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"A client id and secret are required.",
					400,
					// 🔴 Zod issues carry the failing PATH, never the value, so this is
					// safe to return. Echoing the input here would defeat the point.
					parsed.error.issues,
				);
			}
			try {
				return respond(
					c,
					await connectProviderCredentials({
						workspaceId: c.get("authorized").workspaceId,
						...parsed.data,
					}),
				);
			} catch (error) {
				if (/PROVIDER_CREDENTIALS_REJECTED/.test(String(error))) {
					return respondError(
						c,
						"VALIDATION_ERROR",
						"PayPal did not accept those credentials. Check that they are from the right app and environment.",
						400,
					);
				}
				if (/PROVIDER_DOES_NOT_TAKE_CREDENTIALS/.test(String(error))) {
					return respondError(
						c,
						"VALIDATION_ERROR",
						"That provider is connected through its own hosted setup, not by supplying credentials.",
						400,
					);
				}
				throw error;
			}
		},
	);

	// Static Connect routes must stay above the dynamic payment-id routes. Hono
	// matches in registration order, so `/payments/:id` would otherwise capture
	// the literal `connect` segment and reject it as an invalid UUID.
	app.get("/v1/payments/:id", readAccess, readLimit, async (c) => {
		const payment = await getPaymentDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return payment
			? respond(c, payment)
			: respondError(c, "NOT_FOUND", "The payment was not found.", 404);
	});
	app.post("/v1/payments/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "payments.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setPaymentStatusCommand(context, id, status, options.uow),
		);
	});

	app.post("/v1/payments/:id/refund", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const { workspaceId } = c.get("authorized");

		// 🔴 EVERYTHING that can reject this request runs BEFORE the money moves.
		//
		// `buildMutationContext` rejects a missing or malformed Idempotency-Key by
		// throwing, and it used to run *after* the provider refund. A request
		// without the header therefore refunded a real customer and then answered
		// 400 — the operator reads "nothing happened" while the money is gone and
		// QuickDash holds no record of it. That is the same "record that lies"
		// failure described below, one step earlier in the route.
		//
		// Observed 2026-08-11 against the Caffeinate sandbox: $36.00 went back to
		// the card on a call that reported failure. The function's own contract says
		// to call it after authorization and validation and before side effects.
		const context = await mutationContext(c, "payments.refund", { body, id });

		// 🔴 Send the money back BEFORE recording it. Until 2026-08-03 this route
		// wrote the ledger and called no provider at all, so an operator could
		// "refund" a customer who never got their money — a record that lies is
		// worse than a missing feature, because nobody goes looking.
		//
		// A payment taken in cash has no provider to call; that is a normal outcome
		// and the ledger entry is the whole job.
		const atProvider = await refundAtProvider({
			workspaceId,
			paymentId: id,
			amountCents:
				typeof body?.amountCents === "number" ? body.amountCents : undefined,
			reason: typeof body?.reason === "string" ? body.reason : undefined,
		});
		return respondMutation(
			c,
			await refundPaymentCommand(
				context,
				id,
				{
					...body,
					// The provider's own id, so a redelivered `charge.refunded` matches
					// this row instead of creating a second one.
					externalRefundId: atProvider.refunded
						? atProvider.externalRefundId
						: (body?.externalRefundId ?? null),
				},
				options.uow,
			),
		);
	});
}
