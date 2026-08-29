import { afterEach, describe, expect, it } from "vitest";
import { keepAlive } from "./inngest-routes";

/**
 * A fire-and-forget promise has to survive the response.
 *
 * 🔴 `void inngest.send(...)` looked correct and did nothing on Vercel: the
 * handler returns, the platform freezes the instance, and the outbound request
 * is discarded mid-flight with nothing awaiting it to notice. A real order on
 * 2026-08-29 still waited 25 seconds for its confirmation, and the logs showed
 * no Inngest invocation between the commit and the next cron tick.
 */

const KEY = Symbol.for("@vercel/request-context");

afterEach(() => {
	delete (globalThis as unknown as Record<symbol, unknown>)[KEY];
});

function withContext(waitUntil?: (p: Promise<unknown>) => void) {
	(globalThis as unknown as Record<symbol, unknown>)[KEY] = {
		get: () => ({ waitUntil }),
	};
}

describe("keeping a background promise alive", () => {
	it("hands the promise to the host so the instance is not frozen", () => {
		const held: Promise<unknown>[] = [];
		withContext((p) => held.push(p));

		const promise = Promise.resolve("sent");
		keepAlive(promise);

		expect(held).toEqual([promise]);
	});

	/** ⚠️ Local dev, tests, any other host: the cron is still the backstop. */
	it("falls back silently when there is no request context", async () => {
		let settled = false;
		const promise = Promise.resolve().then(() => {
			settled = true;
		});

		expect(() => keepAlive(promise)).not.toThrow();
		await promise;
		expect(settled).toBe(true);
	});

	it("falls back when the host offers a context but no waitUntil", () => {
		withContext(undefined);
		expect(() => keepAlive(Promise.resolve())).not.toThrow();
	});

	/** 🔴 A surprise in the host's internals must never break a committed write. */
	it("survives a host whose context accessor throws", () => {
		(globalThis as unknown as Record<symbol, unknown>)[KEY] = {
			get: () => {
				throw new Error("no context here");
			},
		};
		expect(() => keepAlive(Promise.resolve())).not.toThrow();
	});
});
