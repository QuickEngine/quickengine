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
	adminAccessToken: string;
	apiVersion: string;
	fetchImpl?: ShopifyFetch;
};

type GraphQLResponse<T> = {
	data?: T;
	errors?: Array<{ message: string }>;
};

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
	const response = await call(
		`https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Shopify-Access-Token": config.adminAccessToken,
			},
			body: JSON.stringify({ query, variables }),
		},
	);

	if (!response.ok) {
		// 🔴 The body is deliberately NOT included. Provider responses can echo
		// request contents, and this string reaches logs and Sentry — the same
		// redaction rule the CLI follows.
		throw new ShopifyApiError(operation, response.status);
	}

	const body = (await response.json()) as GraphQLResponse<T>;
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
