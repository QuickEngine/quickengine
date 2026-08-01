import {
	deleteSavedView,
	listPinnedSavedViews,
	listSavedViews,
	saveView,
	setSavedViewPinned,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "sv-owner";
const colleagueId = "sv-colleague";
const workspaceId = "00000000-0000-4000-8000-0000000d0001";

const mine = { workspaceId, userId: ownerId };
const theirs = { workspaceId, userId: colleagueId };

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values
			(${ownerId}, 'SV Owner', 'sv@example.com', true),
			(${colleagueId}, 'SV Colleague', 'svc@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'SV Workspace', 'agency')
	`;
});

describe("saved views", () => {
	it("keeps a view's filters and returns them for its module", async () => {
		await saveView(mine, {
			moduleId: "invoicing",
			name: "Unpaid",
			state: { status: "overdue", sort: "dueAt", q: "", page: 1 },
		});

		const views = await listSavedViews(mine, "invoicing");
		expect(views).toHaveLength(1);
		expect(views[0]?.name).toBe("Unpaid");
		expect(views[0]?.state).toEqual({
			status: "overdue",
			sort: "dueAt",
			q: "",
			page: 1,
		});

		// Scoped to the module: another module's list is unaffected.
		expect(await listSavedViews(mine, "orders")).toEqual([]);
	});

	// 🔴 The guarantee. Views are personal, so two people in one workspace must
	// not see or overwrite each other's.
	it("never leaks a view to another member of the same workspace", async () => {
		await saveView(mine, {
			moduleId: "invoicing",
			name: "My queue",
			state: { status: "draft" },
		});
		await saveView(theirs, {
			moduleId: "invoicing",
			name: "My queue",
			state: { status: "paid" },
		});

		// Same name, same module, same workspace — and they do not collide.
		const ours = await listSavedViews(mine, "invoicing");
		const others = await listSavedViews(theirs, "invoicing");
		expect(ours).toHaveLength(1);
		expect(others).toHaveLength(1);
		expect(ours[0]?.state).toEqual({ status: "draft" });
		expect(others[0]?.state).toEqual({ status: "paid" });

		// And one cannot delete the other's.
		expect(await deleteSavedView(theirs, ours[0]?.id ?? "")).toBe(false);
		expect(await listSavedViews(mine, "invoicing")).toHaveLength(1);
	});

	// Saving twice under one name means "update it" to anyone who has used a
	// spreadsheet, not "fail" and not "make a second one".
	it("updates in place when a name is reused", async () => {
		const first = await saveView(mine, {
			moduleId: "orders",
			name: "To ship",
			state: { status: "paid" },
		});
		const second = await saveView(mine, {
			moduleId: "orders",
			name: "To ship",
			state: { status: "packed" },
		});

		expect(second.id).toBe(first.id);
		const views = await listSavedViews(mine, "orders");
		expect(views).toHaveLength(1);
		expect(views[0]?.state).toEqual({ status: "packed" });
	});

	it("collects pinned views across every module for Home", async () => {
		const unpaid = await saveView(mine, {
			moduleId: "invoicing",
			name: "Unpaid",
			state: {},
		});
		await saveView(mine, {
			moduleId: "orders",
			name: "To ship",
			state: {},
			pinned: true,
		});

		expect(await listPinnedSavedViews(mine)).toHaveLength(1);

		await setSavedViewPinned(mine, unpaid.id, true);
		const pinned = await listPinnedSavedViews(mine);
		expect(pinned).toHaveLength(2);
		expect(pinned.map((view) => view.moduleId).sort()).toEqual([
			"invoicing",
			"orders",
		]);
	});

	it("refuses a nameless view", async () => {
		await expect(
			saveView(mine, { moduleId: "orders", name: "   ", state: {} }),
		).rejects.toThrow("SAVED_VIEW_NAME_REQUIRED");
	});
});
