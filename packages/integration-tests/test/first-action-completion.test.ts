import {
	completeFirstActionChecklistState,
	getFirstActionChecklistState,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Finishing the setup checklist must not break the dashboard.
 *
 * 🔴 It did, permanently. The upsert interpolated a `Date` into a `sql`
 * template, where Drizzle applies no column conversion, so the driver threw
 * `The "string" argument must be of type string ... Received an instance of
 * Date`. The write failed, `completed_at` stayed null, and every later load of
 * `/v1/quickdash/context` took the same branch and threw again — a 500 that
 * began the moment its owner finished setting up and never recovered.
 *
 * Hit a real workspace on 2026-08-29. Nothing had run this path before, because
 * it only ever executes once per person.
 */

const owner = "checklist-owner";
const workspaceId = "00000000-0000-4000-8000-0000001c0001";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'checklist@example.com', true)
		on conflict (id) do nothing
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'custom')
		on conflict (id) do nothing
	`;
	await sql`
		delete from quickdash_first_action_states where workspace_id = ${workspaceId}
	`;
});

describe("completing the setup checklist", () => {
	it("records the completion when no row exists yet", async () => {
		const saved = await completeFirstActionChecklistState(owner, workspaceId);
		expect(saved.completedAt).toBeInstanceOf(Date);

		const read = await getFirstActionChecklistState(owner, workspaceId);
		expect(read.completedAt).toBeInstanceOf(Date);
	});

	/** 🔴 The path that actually broke: a row already exists and is updated. */
	it("records the completion when a row already exists", async () => {
		const sql = testDbClient();
		await sql`
			insert into quickdash_first_action_states
				(user_id, workspace_id, checklist_version, collapsed)
			values (${owner}, ${workspaceId}, 1, false)
		`;

		const saved = await completeFirstActionChecklistState(owner, workspaceId);
		expect(saved.completedAt).toBeInstanceOf(Date);
	});

	/** ⚠️ Completing twice must not move the original timestamp. */
	it("keeps the first completion time when called again", async () => {
		const first = await completeFirstActionChecklistState(owner, workspaceId);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const second = await completeFirstActionChecklistState(owner, workspaceId);

		expect(second.completedAt?.getTime()).toBe(first.completedAt?.getTime());
	});
});

/**
 * A business's own order prefix reaches its orders.
 *
 * 🔴 `numberPrefix` was in the module schema, editable on the settings screen,
 * validated, and read by nothing. Every order was `ORD-0001` however the
 * business had configured it. Found on a workspace set to `CAF`, 2026-08-29,
 * after seven orders had already been numbered wrongly.
 */
describe("the order number prefix", () => {
	it("is returned from the workspace's own settings", async () => {
		const sql = testDbClient();
		const { readOrdersSettings } = await import("@quickengine/mod-orders");

		await sql`
			insert into workspace_modules (workspace_id, module_id, enabled, settings)
			values (${workspaceId}, 'orders', true, ${JSON.stringify({ numberPrefix: "CAF" })})
			on conflict (workspace_id, module_id) do update set settings = excluded.settings
		`;

		expect((await readOrdersSettings(workspaceId)).numberPrefix).toBe("CAF");
	});

	/** ⚠️ A missing or unusable value falls back rather than writing nonsense. */
	it("falls back to the default when nothing usable is configured", async () => {
		const sql = testDbClient();
		const { readOrdersSettings } = await import("@quickengine/mod-orders");

		for (const settings of [{}, { numberPrefix: "" }, { numberPrefix: 42 }]) {
			await sql`
				insert into workspace_modules (workspace_id, module_id, enabled, settings)
				values (${workspaceId}, 'orders', true, ${JSON.stringify(settings)})
				on conflict (workspace_id, module_id) do update set settings = excluded.settings
			`;
			expect((await readOrdersSettings(workspaceId)).numberPrefix).toBe("ORD");
		}
	});
});
