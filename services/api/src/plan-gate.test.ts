import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformEnv } from "./platform-types";

/**
 * The gate between the free product and the paid one.
 *
 * These assert the three things that decide whether this earns money without
 * breaking anything: a free account is refused, a paying account is not, and a
 * public route is never touched by it.
 */
const hasCapability = vi.fn();
vi.mock("@quickengine/billing", () => ({
	hasCapability: (...args: unknown[]) => hasCapability(...args),
}));

const { requireSecondParty } = await import("./plan-gate");

function harness(organizationId: string | null) {
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId());
	app.use("*", async (c, next) => {
		if (organizationId) {
			// Only the shape the gate reads.
			c.set("authorized", {
				workspace: { organizationId },
			} as never);
		}
		return next();
	});
	app.post("/gated", requireSecondParty, (c) => c.json({ created: true }));
	return app;
}

beforeEach(() => hasCapability.mockReset());

describe("the second-party gate", () => {
	it("refuses a free account with 402 and a sentence about what they get", async () => {
		hasCapability.mockResolvedValue(false);

		const res = await harness("org_free").request("/gated", { method: "POST" });
		const body = await res.json();

		expect(res.status).toBe(402);
		expect(body.error.code).toBe("PLAN_UPGRADE_REQUIRED");
		// 🔴 The message is the moment somebody decides to pay. It must say what
		// the plan includes, not merely that the request was refused.
		expect(body.error.message).toMatch(/Commerce/);
		expect(body.error.message).toMatch(/on your own/);
	});

	it("lets a paying account through", async () => {
		hasCapability.mockResolvedValue(true);

		const res = await harness("org_paid").request("/gated", { method: "POST" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ created: true });
		expect(hasCapability).toHaveBeenCalledWith("org_paid", "second-party");
	});

	it("fails closed when there is no organization to bill", async () => {
		// No subscription can be read, so the answer cannot be "allowed".
		const res = await harness(null).request("/gated", { method: "POST" });

		expect(res.status).toBe(402);
		expect(hasCapability).not.toHaveBeenCalled();
	});

	it("does not distinguish a lapsed plan from a free one", async () => {
		// `hasCapability` reads the same subscription row as billing, so an expired
		// plan simply stops being active. There is no second flag to drift.
		hasCapability.mockResolvedValue(false);

		const res = await harness("org_lapsed").request("/gated", {
			method: "POST",
		});

		expect(res.status).toBe(402);
	});
});
