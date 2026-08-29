import { mutationUnitOfWork, onMutationCommitted } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The outbox is drained on commit, not only on the tick.
 *
 * 🔴 The drain ran ONLY on an every-minute cron, so everything downstream of a
 * paid order — the confirmation email, the purchase order, the supplier handoff
 * — waited up to a full minute before it began. Measured on real orders on
 * 2026-08-29: 51 seconds, and 98 seconds on another.
 *
 * ⚠️ The cron is deliberately still there. The outbox is the durable record and
 * a nudge is best effort; these tests pin the two properties that make that
 * safe — it fires only AFTER a commit, and it can never fail the mutation.
 */

const owner = "nudge-owner";
const workspaceId = "00000000-0000-4000-8000-0000001a0001";

let fired = 0;

const context = () => ({
	abortSignal: new AbortController().signal,
	actor: { id: owner, type: "user" as const },
	deadlineAtMs: Date.now() + 30_000,
	fingerprint: crypto.randomUUID(),
	idempotencyKey: `nudge-${crypto.randomUUID()}`,
	operation: "test.nudge",
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

beforeEach(async () => {
	fired = 0;
	onMutationCommitted(() => {
		fired += 1;
	});
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'nudge@example.com', true)
		on conflict (id) do nothing
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${owner}, 'Nudge', 'ecommerce')
		on conflict (id) do nothing
	`;
});

afterEach(() => onMutationCommitted(null));

describe("draining the outbox on commit", () => {
	it("announces a mutation that committed", async () => {
		await mutationUnitOfWork.execute(context(), async () => ({
			result: { ok: true },
			status: 200,
		}));

		expect(fired).toBe(1);
	});

	/** 🔴 A nudge from inside the transaction would announce work a rollback erased. */
	it("says nothing when the work throws", async () => {
		await expect(
			mutationUnitOfWork.execute(context(), async () => {
				throw new Error("rolled back");
			}),
		).rejects.toThrow();

		expect(fired).toBe(0);
	});

	/**
	 * ⚠️ The mutation has already committed by the time this runs. A listener that
	 * throws must never turn a latency problem into a failed write.
	 */
	/** ⚠️ An async listener is AWAITED — that is what stops the host discarding it. */
	it("waits for an async listener before returning", async () => {
		let finished = false;
		onMutationCommitted(async () => {
			await new Promise((resolve) => setTimeout(resolve, 25));
			finished = true;
		});

		await mutationUnitOfWork.execute(context(), async () => ({
			result: { ok: true },
			status: 200,
		}));

		expect(finished).toBe(true);
	});

	it("survives a listener that throws", async () => {
		onMutationCommitted(() => {
			throw new Error("inngest is down");
		});

		const result = await mutationUnitOfWork.execute(context(), async () => ({
			result: { ok: true },
			status: 200,
		}));

		expect(result.kind).toBe("success");
	});
});
