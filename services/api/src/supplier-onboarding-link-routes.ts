import { createHash } from "node:crypto";
import type { CacheProvider } from "@quickengine/cache";
import type { Hono } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * The one public route a supplier opens to connect their payouts.
 *
 * ── Why this is unauthenticated ──────────────────────────────────────────────
 *
 * The person opening it is a supplier, not a customer of ours. They have no
 * QuickDash login and never will. Requiring one would mean asking a partner to
 * create an account with us purely to give Stripe their bank details.
 *
 * 🔴 It is the ONLY route in the API with no authorizer, so the token is the
 * entire boundary. Three things keep that honest:
 *
 *   1. The signature is checked BEFORE anything else happens. A forged or
 *      edited token is refused without a database read or a Stripe call, so
 *      guessing costs an attacker everything and us nothing.
 *   2. It grants exactly one capability — "begin onboarding for this supplier,
 *      in this mode". It reads no data and returns none.
 *   3. It is rate limited on the token itself. `createRateLimit` cannot be used
 *      here: it buckets by authorized principal or session and quietly does
 *      NOTHING when there is neither, which on a public route means no limit at
 *      all. That is the correct default for a route that has an authorizer and
 *      the wrong one for a route that does not.
 *
 * ── Why it redirects rather than rendering ───────────────────────────────────
 *
 * Everything the supplier fills in belongs to Stripe. Rendering our own page
 * would mean building a screen whose only job is to say "please wait" — and any
 * form we drew would be a phishing target that looks like ours.
 */

/** Per token, per window. Generous for a person, useless for a script. */
const ATTEMPT_LIMIT = 10;
const WINDOW_SECONDS = 300;

/** A stable, non-reversible bucket key. The raw token never reaches the cache. */
function tokenBucket(token: string): string {
	return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/**
 * Plain text, deliberately.
 *
 * The reader is a supplier who clicked a link in an email and needs to know
 * whether to act. An error code helps nobody, and an HTML page would be a
 * surface to maintain for the unhappy path of a flow that is otherwise entirely
 * Stripe's.
 */
function say(message: string, status: 400 | 404 | 410 | 429 | 503) {
	return new Response(`${message}\n`, {
		status,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			// Nothing here is cacheable: the same URL yields a different Stripe
			// link every time, and an intermediary holding one would hand a second
			// supplier the first one's onboarding session.
			"cache-control": "no-store",
		},
	});
}

export function registerSupplierOnboardingLinkRoutes(
	app: Hono<PlatformEnv>,
	options: { cache: CacheProvider; logger: ApiLogger },
) {
	app.get("/connect/supplier/:token", async (c) => {
		const token = c.req.param("token");

		const { readSupplierOnboardingToken } = await import(
			"@quickengine/mod-payments"
		);
		const verified = readSupplierOnboardingToken(token);
		if (!verified.ok) {
			// Distinguish only what the reader can act on. "Expired" means ask for
			// another; everything else means the link is wrong, and saying more
			// would tell someone probing which part they got right.
			return verified.reason === "expired"
				? say(
						"This onboarding link has expired. Ask for a new one and it will pick up where you left off.",
						410,
					)
				: say("This onboarding link is not valid.", 400);
		}

		const { workspaceId, supplierId, environment } = verified.claims;

		// Only a validly signed token gets this far, so the budget is spent on
		// real links rather than on noise.
		const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
		try {
			const attempts = await options.cache.increment(
				["supplier-onboarding-link", tokenBucket(token), window].join(":"),
				WINDOW_SECONDS,
			);
			if (attempts > ATTEMPT_LIMIT) {
				return say(
					"Too many attempts. Please try again in a few minutes.",
					429,
				);
			}
		} catch (error) {
			// 🔴 Fail CLOSED. This creates provider accounts; serving without a
			// budget because the counter is unavailable is the wrong trade, and
			// unlike a read there is no customer work lost by asking them to retry.
			options.logger.warn("supplier_onboarding_link.rate_limit_unavailable", {
				error,
				workspaceId,
				supplierId,
			});
			return say("Temporarily unavailable. Please try again shortly.", 503);
		}

		const [{ connectSupplierPaymentAccount }, { startSupplierOnboarding }] =
			await Promise.all([
				// Hard rule 12: provider SDKs load inside the handler, never at module
				// scope, or they end up in the graph of every cold start.
				import("@quickengine/mod-inventory"),
				import("@quickengine/mod-payments"),
			]);

		// The same URL, so an expired or already-used Stripe link sends the
		// supplier back here and they get a fresh one. This is what makes the link
		// we email survive Stripe's few-minute expiry.
		const selfUrl = new URL(c.req.url);
		selfUrl.search = "";
		const here = selfUrl.toString();

		try {
			const { onboardingUrl } = await connectSupplierPaymentAccount({
				workspaceId,
				supplierId,
				refreshUrl: here,
				returnUrl: here,
				onboard: startSupplierOnboarding,
				expectedEnvironment: environment,
			});
			options.logger.info("supplier_onboarding_link.redirected", {
				workspaceId,
				supplierId,
				environment,
			});
			return c.redirect(onboardingUrl, 302);
		} catch (error) {
			const code =
				error && typeof error === "object" && "code" in error
					? String((error as { code: unknown }).code)
					: "";

			if (code === "ENVIRONMENT_MISMATCH") {
				// The workspace changed mode after the link was issued. Refuse rather
				// than onboard into the other one: test and live are separate Stripe
				// accounts, and quietly using the wrong one attaches a real bank
				// account to a rehearsal or a sandbox account to real money.
				return say(
					"This link was issued for a different mode and can no longer be used. Ask for a new one.",
					410,
				);
			}
			if (code === "NOT_FOUND") {
				return say("This supplier no longer exists.", 404);
			}

			options.logger.error("supplier_onboarding_link.failed", {
				error,
				workspaceId,
				supplierId,
				environment,
			});
			return say(
				"We could not start onboarding just now. Please try again shortly.",
				503,
			);
		}
	});
}
