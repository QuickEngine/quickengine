import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";
import { noopLogger } from "./logger";
import type { PlatformDependencies } from "./platform-types";

const config: ApiConfig = {
	baseUrl: "https://api.quickdash.xyz",
	bodyLimitBytes: 1_000_000,
	corsOrigins: new Set(["https://quickdash.xyz"]),
	environment: "test",
	logLevel: "error",
	port: 3020,
	callbackTimeoutMs: 50_000,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 5_000,
	tracesSampleRate: 0,
	version: "0.1.0-test",
};

const WORKSPACE = "33333333-3333-4333-8333-333333333333";
const SUPPLIER = "44444444-4444-4444-8444-444444444444";

const hasCapability = vi.fn();
vi.mock("@quickengine/billing", async (importOriginal) => ({
	...(await importOriginal<object>()),
	hasCapability: (...args: unknown[]) => hasCapability(...args),
}));

/** A workspace with every module on and a key that can do anything. */
const workspace: PlatformDependencies = {
	getSession: async () => null,
	getWorkspaceForUser: async () => null,
	verifyApiKey: async () => ({
		allowedOrigins: [],
		// Everything these routes ask for, so the only thing that can refuse is
		// the plan gate under test.
		capabilities: [
			"inventory:read",
			"inventory:write",
			"catalog:read",
			"catalog:write",
			"orders:read",
			"orders:write",
		],
		id: "key_1",
		type: "secret" as const,
		workspaceId: WORKSPACE,
	}),
	getWorkspaceForKey: async () => ({
		enabledModuleIds: ["inventory", "orders", "catalog"],
		organizationId: "org_1",
		ownerId: "owner_1",
		workspace: {
			businessType: "retail",
			environment: "test",
			id: WORKSPACE,
			name: "Northwind",
			published: true,
			slug: "northwind",
		},
	}),
};

const build = async () => {
	const { registerAllRoutes } = await import("./register-routes");
	return createApp(config, {
		logger: noopLogger,
		registerRoutes: (app, logger) =>
			registerAllRoutes(app, { dependencies: workspace, logger }),
	});
};

const call = async (method: string, path: string) => {
	const app = await build();
	return app.request(path, {
		method,
		headers: {
			"content-type": "application/json",
			authorization: "Bearer qsk_test",
			origin: "https://quickdash.xyz",
		},
		body: method === "GET" || method === "DELETE" ? undefined : "{}",
	});
};

/**
 * The free-to-paid walkthrough, as a test rather than a script somebody has to
 * remember to run.
 *
 * 🔴 The gate started life on the FRONT DOOR only: creating a supplier was
 * refused, and then updating one, connecting one, pricing one and paying one
 * were all wide open. A gate that only guards creation is not a gate, it is a
 * speed bump — anyone with a supplier from a trial, or from before a downgrade,
 * kept the entire paid surface for nothing.
 *
 * ⚠️ Reads and deletes are deliberately NOT gated, and that is the "downgrade
 * keeps your data" promise made executable: somebody who stops paying can still
 * see what they have and still tidy up. We charge for the relationship, not for
 * access to their own records.
 */
const GATED: ReadonlyArray<[string, string]> = [
	["POST", "/v1/inventory/suppliers"],
	["PATCH", `/v1/inventory/suppliers/${SUPPLIER}`],
	["POST", `/v1/inventory/suppliers/${SUPPLIER}/payment-account`],
	["GET", `/v1/inventory/suppliers/${SUPPLIER}/payment-account/link`],
	["POST", "/v1/inventory/supplier-connections"],
	["POST", "/v1/inventory/supplier-connections/check"],
	["POST", "/v1/inventory/supplier-skus"],
	["PATCH", `/v1/inventory/supplier-skus/${SUPPLIER}`],
	["POST", "/v1/partner-links"],
	["PATCH", `/v1/partner-links/${SUPPLIER}`],
];

const OPEN: ReadonlyArray<[string, string]> = [
	["GET", "/v1/inventory/suppliers"],
	["GET", "/v1/inventory/supplier-skus"],
	["GET", "/v1/inventory/purchase-orders"],
	["GET", "/v1/inventory/supplier-connections"],
	["DELETE", `/v1/inventory/suppliers/${SUPPLIER}`],
	["DELETE", `/v1/inventory/supplier-skus/${SUPPLIER}`],
];

describe("free to paid, on the real route table", () => {
	beforeEach(() => hasCapability.mockReset());

	it.each(GATED)(
		"%s %s is refused on the free plan, with the sentence that sells it",
		async (method, path) => {
			hasCapability.mockResolvedValue(false);

			const res = await call(method, path);
			expect(res.status).toBe(402);

			const body = await res.json();
			expect(body.error.code).toBe("PLAN_UPGRADE_REQUIRED");
			expect(body.error.message).toMatch(/Commerce/);
		},
	);

	it.each(GATED)("%s %s gets past the gate once paid", async (method, path) => {
		hasCapability.mockResolvedValue(true);

		const res = await call(method, path);
		// Past the gate is the claim. What is beyond it is another test's job:
		// these send empty bodies and hit validation or a missing record, which
		// is fine. 402 with this code is the only failure that matters here.
		if (res.status === 402) {
			expect((await res.json()).error.code).not.toBe("PLAN_UPGRADE_REQUIRED");
		}
		expect(hasCapability).toHaveBeenCalledWith("org_1", "second-party");
	});

	it.each(OPEN)(
		"%s %s stays open, so a downgrade keeps the data",
		async (method, path) => {
			hasCapability.mockResolvedValue(false);

			const res = await call(method, path);
			expect(res.status).not.toBe(402);
			// The gate must not even be consulted on these.
			expect(hasCapability).not.toHaveBeenCalled();
		},
	);
});
