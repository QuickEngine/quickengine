import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import { createRequestDeadline } from "./deadline";
import { noopLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

describe("request deadline", () => {
	it("propagates an abort signal and returns the standard 504 envelope", async () => {
		const app = new Hono<PlatformEnv>();
		let observedAbort = false;
		app.use("*", requestId());
		app.use("*", createRequestDeadline(20, noopLogger));
		app.get("/slow", async (c) => {
			const signal = c.get("abortSignal");
			await new Promise<void>((resolve) => {
				signal.addEventListener(
					"abort",
					() => {
						observedAbort = true;
						resolve();
					},
					{ once: true },
				);
			});
			return c.json({ late: true });
		});

		const response = await app.request("/slow");
		const body = await response.json();

		expect(response.status).toBe(504);
		expect(body.error.code).toBe("REQUEST_TIMEOUT");
		expect(observedAbort).toBe(true);
	});

	it("clears the deadline when work completes", async () => {
		const app = new Hono<PlatformEnv>();
		app.use("*", requestId());
		app.use("*", createRequestDeadline(50, noopLogger));
		app.get("/fast", (c) => c.json({ ok: true }));

		const response = await app.request("/fast");
		expect(response.status).toBe(200);
	});
});
