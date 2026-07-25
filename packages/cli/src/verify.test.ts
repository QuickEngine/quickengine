import { QuickApiError } from "@quickengine/quick";
import { describe, expect, it, vi } from "vitest";
import type { buildClient } from "./config";
import { verifyConnection } from "./verify";

const config = {
	baseUrl: "https://api.quickengine.test",
	workspaceId: "00000000-0000-4000-8000-000000000001",
	key: "qsk_test",
};

/** A client whose only job is to answer `clients.list()` however the test wants. */
const connectWith = (list: () => Promise<unknown>) =>
	(() => ({
		client: { clients: { list } },
		config,
	})) as unknown as typeof buildClient;

const apiError = (code: string, status: number) =>
	new QuickApiError({ code, message: code, status, requestId: "r" });

const rejecting = (error: unknown) => connectWith(() => Promise.reject(error));

describe("connection verification", () => {
	it("succeeds when the workspace can be read", async () => {
		const connect = connectWith(async () => ({ data: { items: [{}, {}] } }));
		await expect(verifyConnection(config, connect)).resolves.toMatchObject({
			ok: true,
			detail: "read 2 client record(s)",
		});
	});

	it("treats a capability refusal as connected", async () => {
		// The key authenticated and the workspace resolved — that IS a working
		// connection. Reporting it as unreachable sends people to debug their
		// network when the answer is their key's permissions.
		const result = await verifyConnection(
			config,
			rejecting(apiError("CAPABILITY_DENIED", 403)),
		);
		expect(result.ok).toBe(true);
	});

	it("treats a disabled module as connected", async () => {
		const result = await verifyConnection(
			config,
			rejecting(apiError("MODULE_DISABLED", 403)),
		);
		expect(result.ok).toBe(true);
	});

	it("blames the key when authentication fails", async () => {
		await expect(
			verifyConnection(config, rejecting(apiError("INVALID_API_KEY", 401))),
		).resolves.toMatchObject({ ok: false, reason: "key" });
	});

	it("blames the workspace when it cannot be found", async () => {
		await expect(
			verifyConnection(config, rejecting(apiError("WORKSPACE_NOT_FOUND", 404))),
		).resolves.toMatchObject({ ok: false, reason: "workspace" });
	});

	it("rejects a malformed key before making a request", async () => {
		const list = vi.fn();
		const result = await verifyConnection(
			{ ...config, key: "nope_123" },
			connectWith(list),
		);
		expect(result).toMatchObject({ ok: false, reason: "key" });
		// No point spending a round trip on a key that cannot be valid.
		expect(list).not.toHaveBeenCalled();
	});

	it("reports a transport failure as a network problem", async () => {
		await expect(
			verifyConnection(config, rejecting(new TypeError("fetch failed"))),
		).resolves.toMatchObject({
			ok: false,
			reason: "network",
			detail: "fetch failed",
		});
	});
});
