import { describe, expect, it } from "vitest";
import type { ApiConfig } from "./config";
import { createOpenApiDocument } from "./openapi";
import { REQUEST_EXAMPLES } from "./openapi-examples";
import { REQUEST_SCHEMAS } from "./openapi-requests";
import { RESPONSE_SCHEMAS } from "./openapi-responses";

const config = {
	baseUrl: "https://api.quickengine.test",
	bodyLimitBytes: 1024,
	callbackTimeoutMs: 50_000,
	corsOrigins: new Set<string>(),
	environment: "test",
	logLevel: "error",
	port: 3020,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 1000,
	tracesSampleRate: 0,
	version: "0.1.0",
} as ApiConfig;

const document = createOpenApiDocument(config);
type Operation = {
	operationId?: string;
	requestBody?: unknown;
	responses?: Record<string, { content?: unknown }>;
};
const operations = Object.values(
	document.paths as Record<string, Record<string, Operation>>,
).flatMap((item) => Object.values(item));

/**
 * Mutating operations that legitimately carry no JSON body.
 *
 * Every entry is a deliberate statement, not a backlog: a status transition whose
 * value is in the path, an action with no parameters, or a provider callback with
 * its own wire format. Anything not listed here and not in `REQUEST_SCHEMAS` is
 * an undocumented body, which is what the coverage test below catches.
 */
const BODYLESS = new Set([
	// The provider order is in the path. Its stored payment chooses both the
	// provider and merchant account, so accepting a body would only create an
	// unsafe second place for the browser to name either one.
	"captureCheckoutPayment",
	// The session being revoked is the one presented in the header. A body would
	// only offer a caller somewhere to name a different token.
	"signOutCustomer",
	// The token is the whole request — it is in the path, and a body would only
	// give a caller somewhere to put a second, conflicting one.
	"acceptInvitation",
	// Quote lifecycle: the transition is the operation and the record is in the
	// path. `reviseQuote` copies the quote it supersedes; there is nothing to send.
	"expireQuote",
	"reviseQuote",
	"voidQuote",
	// The booking is in the path and everything else is read from it — the
	// service, its price, the client. Accepting a body would invite a caller to
	// override the price that was actually agreed.
	"invoiceBooking",
	// A referral code is minted for whoever is signed in. A body would only offer
	// a caller somewhere to name a different customer.
	"issueReferralCode",
	// Same reasoning: the handoff is minted for the session presenting it. A body
	// would only offer a caller somewhere to name somebody else to hand over as.
	"requestPortalHandoff",
	// A refresh takes no input: the workspace comes from the credential and the
	// account from that workspace's stored row. A body would only offer a caller
	// somewhere to name somebody else's connected account.
	"refreshPaymentConnectAccount",
	// Nothing to send: which notification is in the path, and who is the session.
	"markNotificationRead",
	"markAllNotificationsRead",
	"markCustomerConversationRead",
	"markOperatorCustomerConversationRead",
	"setCatalogItemStatus",
	"setProductVariantStatus",
	"sendQuote",
	"declineQuote",
	"convertQuote",
	"setInvoiceStatus",
	"setPaymentStatus",
	"setOrderStatus",
	"ensureOrderFulfillment",
	"setFulfillmentStatus",
	"setInventoryItemStatus",
	"setShipmentStatus",
	"setProjectStatus",
	"archiveProject",
	"restoreProject",
	"setMilestoneStatus",
	"setTaskStatus",
	"setBookingStatus",
	"stopTimer",
	"approveTimeEntry",
	"unapproveTimeEntry",
	"voidTimeEntry",
	"restoreVoidedTimeEntry",
	"invoiceApprovedTimeEntries",
	"detachTimeEntriesFromDraftInvoice",
	"sendContract",
	"expireContract",
	"voidContract",
	"reviseContract",
	"setFileDocumentStatus",
	"releaseQuarantinedFileVersion",
	"replayWebhookDelivery",
	// Form-encoded, and called by the realtime provider rather than by a customer.
	"authorizeRealtimeChannel",
]);

describe("OpenAPI document", () => {
	it("advertises the configured origin, not a build-time default", () => {
		expect(document.servers).toEqual([{ url: "https://api.quickengine.test" }]);
	});

	it("derives every request body from the schema the route validates with", () => {
		for (const operationId of Object.keys(REQUEST_SCHEMAS)) {
			const operation = operations.find((o) => o.operationId === operationId);
			expect(
				operation,
				`${operationId} is registered but has no path`,
			).toBeDefined();
			expect(
				operation?.requestBody,
				`${operationId} has no requestBody`,
			).toBeDefined();
		}
	});

	it("registers a component schema for each documented body", () => {
		const schemas = (
			document.components as { schemas: Record<string, unknown> }
		).schemas;
		for (const operationId of Object.keys(REQUEST_SCHEMAS)) {
			// Referenced as a component rather than inlined, so a shape shared by
			// create and update appears once.
			expect(schemas[`${operationId}Request`]).toBeDefined();
		}
	});

	it("leaves no mutating operation with an undocumented body", () => {
		const undocumented = Object.entries(
			document.paths as Record<string, Record<string, Operation>>,
		).flatMap(([path, item]) =>
			(["post", "put", "patch"] as const)
				.map((method) => item[method])
				.filter(
					(op): op is Operation =>
						Boolean(op?.operationId) &&
						!op?.requestBody &&
						!BODYLESS.has(op?.operationId as string),
				)
				.map((op) => `${op.operationId} (${path})`),
		);
		// A new mutating route must either register its schema or be declared
		// bodyless. This is the line that stops the document rotting again.
		expect(undocumented).toEqual([]);
	});

	it("returns the platform error envelope for every failure response", () => {
		const bare = operations.flatMap((op) =>
			Object.entries(op.responses ?? {})
				.filter(
					([status, response]) => /^[45]/.test(status) && !response.content,
				)
				.map(([status]) => `${op.operationId}:${status}`),
		);
		expect(bare).toEqual([]);
	});

	it("keeps error schemas as references rather than copies", () => {
		const createClient = operations.find(
			(o) => o.operationId === "createClient",
		);
		const failure = Object.entries(createClient?.responses ?? {}).find(
			([status]) => status.startsWith("4"),
		);
		expect(failure, "createClient documents no failure response").toBeDefined();

		const content = failure?.[1].content as Record<
			string,
			{ schema: { $ref: string } }
		>;
		// A $ref, not an inlined copy — one envelope definition, referenced 108 times.
		expect(content["application/json"].schema.$ref).toBe(
			"#/components/schemas/ErrorEnvelope",
		);
	});

	it("documents an example for every request body", () => {
		const missing = Object.keys(REQUEST_SCHEMAS).filter(
			(id) => !(id in REQUEST_EXAMPLES),
		);
		expect(missing).toEqual([]);
	});

	it("validates every example against the schema it illustrates", () => {
		const invalid: string[] = [];
		for (const [id, example] of Object.entries(REQUEST_EXAMPLES)) {
			const schema = REQUEST_SCHEMAS[id];
			if (!schema) {
				invalid.push(`${id}: example with no schema`);
				continue;
			}
			const parsed = schema.safeParse(example);
			if (!parsed.success) {
				invalid.push(`${id}: ${parsed.error.issues[0]?.message}`);
			}
		}
		// An unchecked example is a promise nobody is keeping. If a schema gains a
		// required field, its example must be updated in the same change.
		expect(invalid).toEqual([]);
	});

	it("documents the success envelope on every 2xx response", () => {
		const bare = operations.flatMap((op) =>
			Object.entries(op.responses ?? {})
				.filter(([status, response]) => /^2/.test(status) && !response.content)
				.map(([status]) => `${op.operationId}:${status}`),
		);
		expect(bare).toEqual([]);
	});

	it("does not publish fields the API withholds", () => {
		const serialized = JSON.stringify(document);
		// Table-derived response schemas would leak these. The success envelope
		// leaves `data` open precisely so it cannot claim a shape it can't keep.
		expect(serialized).not.toContain("secretCiphertext");
		expect(serialized).not.toContain("secret_ciphertext");
	});

	it("documents the resource shape for every registered response", () => {
		const missing = Object.keys(RESPONSE_SCHEMAS).filter((id) => {
			const op = operations.find((o) => o.operationId === id);
			const success = Object.entries(op?.responses ?? {}).find(([status]) =>
				status.startsWith("2"),
			);
			const schema = (
				success?.[1].content as
					| Record<string, { schema?: { properties?: { data?: unknown } } }>
					| undefined
			)?.["application/json"]?.schema?.properties?.data;
			return !schema;
		});
		expect(missing).toEqual([]);
	});

	it("falls back to the bare envelope rather than guessing a shape", () => {
		// Operations without a registered schema must still say what the wrapper is.
		// Claiming a resource shape we have not proved would be worse than silence.
		const undocumented = operations.filter(
			(op) =>
				op.operationId &&
				!(op.operationId in RESPONSE_SCHEMAS) &&
				Object.entries(op.responses ?? {}).some(
					([status, response]) => /^2/.test(status) && !response.content,
				),
		);
		expect(undocumented).toEqual([]);
	});
});

/**
 * 🔴 Every registered `/v1` route must be documented.
 *
 * 26 were not when this was written — including quote expire/void/revise,
 * booking-to-invoice, saved views, support bundle, request lookup, account
 * revenue and the credit routes. The document drifted silently because nothing
 * compared it against the real route table, exactly like the tenant-isolation
 * sweep before it enumerated routes.
 */
describe("OpenAPI completeness", () => {
	it("documents every registered v1 route", async () => {
		const { createApp } = await import("./app");
		const { registerAllRoutes } = await import("./register-routes");
		const { noopLogger } = await import("./logger");

		const app = createApp(config, {
			logger: noopLogger,
			registerRoutes: (instance, logger) =>
				registerAllRoutes(instance, {
					dependencies: {
						getSession: async () => null,
						getWorkspaceForUser: async () => null,
						getWorkspaceForKey: async () => null,
						verifyApiKey: async () => null,
					},
					logger,
				}),
		});

		const document = createOpenApiDocument(config);

		// Hono uses `:param`; OpenAPI uses `{param}`.
		const documented = new Set<string>();
		for (const [path, methods] of Object.entries(document.paths ?? {})) {
			for (const method of Object.keys(methods as object)) {
				documented.add(`${method.toUpperCase()} ${path}`);
			}
		}

		const missing = new Set<string>();
		for (const route of app.routes) {
			if (!route.path.startsWith("/v1")) continue;
			if (route.method === "ALL") continue;
			// QuickDash console routes are internal to our own apps, not public API.
			if (route.path.startsWith("/v1/quickdash")) continue;
			const openApiPath = route.path.replace(/:(\w+)/g, "{$1}");
			const key = `${route.method} ${openApiPath}`;
			if (!documented.has(key)) missing.add(key);
		}

		if (missing.size > 0) {
			throw new Error(
				`${missing.size} registered routes are absent from the OpenAPI document:\n  ${[...missing].sort().join("\n  ")}`,
			);
		}
	});
});
