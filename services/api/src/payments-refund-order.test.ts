import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";
import { noopLogger } from "./logger";
import type {
	PlatformDependencies,
	WorkspaceResolution,
} from "./platform-types";

/**
 * 🔴 A refund must not be able to outrun the checks that can reject it.
 *
 * The route used to call the payment provider BEFORE building the mutation
 * context, and that context is what rejects a missing Idempotency-Key. So a
 * request without the header refunded a real customer at Stripe and then
 * answered 400, leaving the operator reading "nothing happened" while the money
 * was gone and QuickDash held no record of it.
 *
 * Observed 2026-08-11 against the Caffeinate sandbox: $36.00 went back to the
 * card on a call that reported failure.
 */

const refundAtProvider = vi.hoisted(() => vi.fn());

vi.mock("@quickengine/mod-payments", async (importOriginal) => ({
	...(await importOriginal<typeof import("@quickengine/mod-payments")>()),
	refundAtProvider,
}));

const config: ApiConfig = {
	baseUrl: "https://api.quickdash.xyz",
	bodyLimitBytes: 1024,
	callbackTimeoutMs: 50_000,
	corsOrigins: new Set(["https://quickdash.xyz"]),
	environment: "test",
	logLevel: "error",
	port: 3020,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 50_000,
	tracesSampleRate: 0,
	version: "0.1.0-test",
};

const WORKSPACE = "00000000-0000-4000-8000-0000000c0001";
const PAYMENT = "00000000-0000-4000-8000-0000000c0002";

const workspaceFor = (id: string): WorkspaceResolution => ({
	capabilities: ["payments:write", "payments:read"],
	enabledModuleIds: ["payments"],
	organizationId: `org-${id}`,
	ownerId: `owner-${id}`,
	workspace: {
		businessType: "test",
		environment: "live",
		published: true,
		id,
		name: "Test",
		slug: "test",
	},
});

const dependencies: PlatformDependencies = {
	getSession: async () => null,
	getWorkspaceForUser: async () => null,
	getWorkspaceForKey: async (id) => workspaceFor(id),
	verifyApiKey: async (raw) =>
		raw === "sk_refund_order"
			? {
					allowedOrigins: [],
					capabilities: ["payments:write", "payments:read"],
					id: "key_refund_order",
					type: "secret",
					workspaceId: WORKSPACE,
				}
			: null,
};

async function refundRequest(headers: Record<string, string>) {
	const { registerAllRoutes } = await import("./register-routes");
	const app = createApp(config, {
		logger: noopLogger,
		registerRoutes: (instance, logger) =>
			registerAllRoutes(instance, { dependencies, logger }),
	});
	return app.request(`/v1/payments/${PAYMENT}/refund`, {
		method: "POST",
		headers: {
			Authorization: "Bearer sk_refund_order",
			"QuickEngine-Workspace": WORKSPACE,
			"content-type": "application/json",
			...headers,
		},
		body: JSON.stringify({ amountCents: 3600 }),
	});
}

describe("Refund ordering", () => {
	it("does not touch the provider when the idempotency key is missing", async () => {
		refundAtProvider.mockReset();

		const response = await refundRequest({});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.code).toBe("IDEMPOTENCY_REQUIRED");
		// The whole point: no money moved.
		expect(refundAtProvider).not.toHaveBeenCalled();
	});

	it("does not touch the provider when the idempotency key is malformed", async () => {
		refundAtProvider.mockReset();

		const response = await refundRequest({ "Idempotency-Key": "  " });

		expect(response.status).toBe(400);
		expect(refundAtProvider).not.toHaveBeenCalled();
	});
});
