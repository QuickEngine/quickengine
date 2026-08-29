import { afterEach, describe, expect, it } from "vitest";
import { keepAlive, settleWithin } from "./inngest-routes";

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

	/** 🔴 The return value is what tells the caller whether it must await. */
	it("reports whether the host actually took it", () => {
		withContext((_p) => {});
		expect(keepAlive(Promise.resolve())).toBe(true);
	});

	/** ⚠️ Local dev, tests, any other host: the cron is still the backstop. */
	it("falls back silently when there is no request context", async () => {
		let settled = false;
		const promise = Promise.resolve().then(() => {
			settled = true;
		});

		expect(keepAlive(promise)).toBe(false);
		await promise;
		expect(settled).toBe(true);
	});

	it("falls back when the host offers a context but no waitUntil", () => {
		withContext(undefined);
		expect(keepAlive(Promise.resolve())).toBe(false);
	});

	/** 🔴 A surprise in the host's internals must never break a committed write. */
	it("survives a host whose context accessor throws", () => {
		(globalThis as unknown as Record<symbol, unknown>)[KEY] = {
			get: () => {
				throw new Error("no context here");
			},
		};
		expect(keepAlive(Promise.resolve())).toBe(false);
	});

	/**
	 * 🔴 Awaited AS WELL as handed off. A checkout on 2026-08-29 waited 18s for
	 * its nudge while the payment webhook's landed in 3 on the same deployment —
	 * `waitUntil` said it had the promise and the platform dropped it anyway.
	 */
	it("waits for the send even when the host claims it", async () => {
		let settled = false;
		const slow = new Promise<void>((resolve) =>
			setTimeout(() => {
				settled = true;
				resolve();
			}, 20),
		);
		withContext(() => {});

		keepAlive(slow);
		await settleWithin(slow, 2_000);

		expect(settled).toBe(true);
	});
});

describe("capping how long a commit waits", () => {
	/** ⚠️ A stuck provider must cost a write a moment, not a timeout. */
	it("gives up once the cap expires", async () => {
		const never = new Promise<void>(() => {});
		const started = Date.now();

		await settleWithin(never, 40);

		expect(Date.now() - started).toBeLessThan(1_000);
	});

	it("returns as soon as the send finishes, without waiting out the cap", async () => {
		const started = Date.now();
		await settleWithin(Promise.resolve(), 5_000);
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	/** A failed send is already caught upstream; this must not throw either. */
	it("does not throw when the promise rejects", async () => {
		await expect(
			settleWithin(
				Promise.reject(new Error("inngest down")).catch(() => {}),
				50,
			),
		).resolves.toBeUndefined();
	});
});
