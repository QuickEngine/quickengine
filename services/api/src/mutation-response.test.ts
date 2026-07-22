import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import { respondMutation } from "./mutation-response";
import type { PlatformEnv } from "./platform-types";

function appFor(outcome: Parameters<typeof respondMutation>[1]) {
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId({ headerName: "X-Request-Id" }));
	app.post("/mutation", (c) => respondMutation(c, outcome));
	return app;
}

describe("mutation outcome responses", () => {
	it("replays the original result with the current request ID", async () => {
		const response = await appFor({
			kind: "success",
			result: { id: "client_1" },
			source: "replayed",
			status: 201,
		}).request("/mutation", {
			headers: { "X-Request-Id": "current-request" },
			method: "POST",
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(response.headers.get("idempotency-replayed")).toBe("true");
		expect(body).toEqual({
			data: { id: "client_1" },
			meta: { requestId: "current-request" },
		});
	});

	it("distinguishes mismatched and in-progress requests", async () => {
		const conflict = await appFor({ kind: "conflict" }).request("/mutation", {
			method: "POST",
		});
		const pending = await appFor({
			kind: "in_progress",
			retryAfterSeconds: 2,
		}).request("/mutation", { method: "POST" });

		expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
		expect((await pending.json()).error.code).toBe("IDEMPOTENCY_IN_PROGRESS");
		expect(pending.headers.get("retry-after")).toBe("2");
	});
});
