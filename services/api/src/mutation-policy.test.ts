import { describe, expect, it } from "vitest";
import {
	buildMutationContext,
	fingerprintCanonicalInput,
	MutationPolicyError,
} from "./mutation-policy";
import type { AuthorizedApiContext } from "./platform-types";

const authorized: AuthorizedApiContext = {
	auditActor: { id: "user_1", type: "user" },
	principal: { kind: "session", role: "owner", userId: "user_1" },
	workspace: {
		enabledModuleIds: ["client-records"],
		organizationId: "org_1",
		role: "owner",
		workspace: {
			businessType: "agency",
			id: "workspace_1",
			name: "Example",
			slug: "example",
		},
	},
	workspaceId: "workspace_1",
};

describe("mutation policy", () => {
	it("fingerprints canonical validated input independently of object key order", async () => {
		await expect(
			fingerprintCanonicalInput({ amount: 100, client: { id: "client_1" } }),
		).resolves.toBe(
			await fingerprintCanonicalInput({
				client: { id: "client_1" },
				amount: 100,
			}),
		);
		expect(await fingerprintCanonicalInput(["a", "b"])).not.toBe(
			await fingerprintCanonicalInput(["b", "a"]),
		);
	});

	it("accepts shared acyclic values but rejects actual cycles", async () => {
		const shared = { id: "client_1" };
		await expect(
			fingerprintCanonicalInput({ left: shared, right: shared }),
		).resolves.toBe(
			await fingerprintCanonicalInput({
				left: { id: "client_1" },
				right: { id: "client_1" },
			}),
		);

		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		await expect(fingerprintCanonicalInput(cyclic)).rejects.toThrow(
			"Canonical input must not be cyclic",
		);
	});

	it("builds provenance only after a valid idempotency key is supplied", async () => {
		const controller = new AbortController();
		const context = await buildMutationContext({
			authorized,
			abortSignal: controller.signal,
			canonicalInput: { name: "Client" },
			deadlineAtMs: 1234,
			idempotencyKey: "intent_12345678",
			operation: "client-records.create",
			requestId: "req_1",
		});

		expect(context).toMatchObject({
			actor: { id: "user_1", type: "user" },
			deadlineAtMs: 1234,
			idempotencyKey: "intent_12345678",
			operation: "client-records.create",
			organizationId: "org_1",
			requestId: "req_1",
			source: "api",
			workspaceId: "workspace_1",
		});
		expect(context.fingerprint).toHaveLength(64);
	});

	it("rejects missing and malformed idempotency keys", async () => {
		const base = {
			authorized,
			abortSignal: new AbortController().signal,
			canonicalInput: {},
			deadlineAtMs: 1234,
			operation: "client-records.create",
			requestId: "req_1",
		};
		await expect(buildMutationContext(base)).rejects.toMatchObject({
			code: "IDEMPOTENCY_REQUIRED",
		});
		await expect(
			buildMutationContext({ ...base, idempotencyKey: "bad key" }),
		).rejects.toBeInstanceOf(MutationPolicyError);
	});
});
