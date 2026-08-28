export type ShopifyFetch = typeof fetch;

export class ShopifyApiError extends Error {
	constructor(
		readonly operation: string,
		readonly status: number,
		readonly detail?: string,
	) {
		super(`Shopify ${operation} failed (${status}).`);
	}
}

/**
 * The Shopify Admin GraphQL transport.
 *
 * 🔴 Plain `fetch`, deliberately — no `@shopify/admin-api-client`, no SDK.
 *
 * Hard rule 12 in `CLAUDE.md`: a provider SDK imported at module level lands in
 * the graph of route registration and of `openapi.test.ts`, which then times out
 * at 5000ms and reads as a missing route. That has broken CI three times. A
 * lazily-imported SDK works around the rule; having no SDK removes the failure
 * mode entirely, and the Admin API is one POST with a header.
 *
 * ⚠️ `fetch` is injectable so the adapter is testable without a network. Every
 * test passes a fake; nothing in this package ever opens a socket under `pnpm
 * test`.
 */
export type ShopifyConfig = {
	shopDomain: string;
	/**
	 * A legacy permanent `shpat_…` token. Preferred when present so stores
	 * connected before the deprecation keep working untouched.
	 */
	adminAccessToken?: string;
	/** Dev Dashboard credential, exchanged for a short-lived token. */
	clientId?: string;
	clientSecret?: string;
	apiVersion: string;
	fetchImpl?: ShopifyFetch;
	/** Injectable so backoff is testable without actually waiting. */
	sleepImpl?: (ms: number) => Promise<void>;
};

/**
 * Where the access token comes from.
 *
 * 🔴 Shopify deprecated admin-created custom apps, and with them the permanent
 * `shpat_…` token. A Dev Dashboard app is issued a client id and secret and
 * exchanges them for an Admin API token that **expires in 24 hours**
 * (`expires_in: 86399`). Storing a minted token is therefore a bug with a
 * one-day fuse: it works the evening an operator pastes it in and 401s the next
 * morning — which is precisely when somebody is watching a demo.
 *
 * So a connection stores the CREDENTIAL, never the token. The token is minted on
 * demand and cached in memory until shortly before it expires.
 *
 * ⚠️ The cache is per process and deliberately not persisted. A token is cheap
 * to re-mint, a stale one written to a database is not, and a serverless process
 * that dies takes nothing with it that matters.
 */
type CachedToken = { token: string; expiresAt: number };

const tokenCache = new Map<string, CachedToken>();

/** Refresh a minute early: a token that expires in flight reads as a 401. */
const EXPIRY_MARGIN_MS = 60_000;

/** Drop a cached token — used when Shopify rejects one we believed was live. */
export function forgetShopifyToken(shopDomain: string, clientId: string): void {
	tokenCache.delete(`${shopDomain}:${clientId}`);
}

export async function resolveAccessToken(
	config: ShopifyConfig,
): Promise<string> {
	if (config.adminAccessToken) return config.adminAccessToken;

	const { clientId, clientSecret } = config;
	if (!clientId || !clientSecret) {
		throw new ShopifyApiError(
			"access token",
			401,
			"No Shopify credential is configured for this supplier.",
		);
	}

	const key = `${config.shopDomain}:${clientId}`;
	const cached = tokenCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.token;

	const call = config.fetchImpl ?? fetch;
	const response = await call(
		`https://${config.shopDomain}/admin/oauth/access_token`,
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: clientId,
				client_secret: clientSecret,
			}).toString(),
		},
	);

	// 🔴 The body is withheld from the error on purpose: a failed token exchange
	// can echo the request back, and this string reaches logs and Sentry.
	if (!response.ok) throw new ShopifyApiError("access token", response.status);

	const body = (await response.json()) as {
		access_token?: string;
		expires_in?: number;
	};
	if (!body.access_token) {
		throw new ShopifyApiError("access token", 200, "No token returned.");
	}

	const lifetimeMs = (body.expires_in ?? 86_399) * 1000;
	tokenCache.set(key, {
		token: body.access_token,
		expiresAt: Date.now() + Math.max(lifetimeMs - EXPIRY_MARGIN_MS, 0),
	});
	return body.access_token;
}

type GraphQLResponse<T> = {
	data?: T;
	errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

/** Attempt budget. Four tries spans ~7s of backoff, well inside a job's life. */
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait before trying again.
 *
 * Shopify sends `Retry-After` on a 429 and it is authoritative — guessing
 * shorter just burns the budget against a bucket that is still empty. Falls back
 * to exponential backoff for throttles that arrive without one.
 */
function backoffMs(attempt: number, retryAfter: string | null): number {
	const advertised = retryAfter ? Number(retryAfter) : Number.NaN;
	if (Number.isFinite(advertised) && advertised > 0) {
		return Math.min(advertised * 1000, 10_000);
	}
	return Math.min(2 ** attempt * 500, 8_000);
}

/**
 * One GraphQL round trip.
 *
 * ⚠️ Shopify answers **200 with an `errors` array** for a failed query, and
 * mutations answer 200 with a `userErrors` array inside the payload. Checking
 * only the HTTP status is how a failed order creation gets recorded as a
 * success, so both are raised here and at the call site respectively.
 */
export async function shopifyGraphQL<T>(
	config: ShopifyConfig,
	operation: string,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const call = config.fetchImpl ?? fetch;
	const pause = config.sleepImpl ?? sleep;
	const accessToken = await resolveAccessToken(config);
	let lastThrottle: ShopifyApiError | undefined;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const response = await call(
			`https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Shopify-Access-Token": accessToken,
				},
				body: JSON.stringify({ query, variables }),
			},
		);

		/**
		 * ⚠️ The Admin API is a leaky bucket — roughly 40 points a second, and
		 * `orderCreate` costs 10. A burst of paid orders WILL hit this, and an
		 * un-retried throttle means a supplier never hears about somebody's coffee.
		 *
		 * 🔴 Retried only for throttling and for Shopify's own 5xx. A 401, a 404 or
		 * a refused mutation is a permanent answer, and retrying it four times
		 * delays the failure without changing it.
		 */
		if (response.status === 429 || response.status >= 500) {
			lastThrottle = new ShopifyApiError(operation, response.status);
			if (attempt < MAX_ATTEMPTS - 1) {
				await pause(
					backoffMs(attempt, response.headers?.get?.("retry-after") ?? null),
				);
				continue;
			}
			throw lastThrottle;
		}

		if (!response.ok) {
			// 🔴 The body is deliberately NOT included. Provider responses can echo
			// request contents, and this string reaches logs and Sentry — the same
			// redaction rule the CLI follows.
			throw new ShopifyApiError(operation, response.status);
		}

		const body = (await response.json()) as GraphQLResponse<T>;

		/**
		 * ⚠️ GraphQL throttling arrives as **200 with a THROTTLED error code**, not
		 * as a 429. Treating status alone as success is how a throttled order looks
		 * like a permanent failure and gets marked `failed` instead of retried.
		 */
		if (body.errors?.some((error) => error.extensions?.code === "THROTTLED")) {
			lastThrottle = new ShopifyApiError(operation, 200, "Throttled.");
			if (attempt < MAX_ATTEMPTS - 1) {
				await pause(backoffMs(attempt, null));
				continue;
			}
			throw lastThrottle;
		}

		if (body.errors?.length) {
			throw new ShopifyApiError(
				operation,
				200,
				body.errors.map((error) => error.message).join("; "),
			);
		}
		if (!body.data)
			throw new ShopifyApiError(operation, 200, "No data returned.");
		return body.data;
	}

	throw lastThrottle ?? new ShopifyApiError(operation, 429);
}
