import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	CategoryError,
	createCategory,
	deleteCategory,
	listCategoryItemIds,
	listCategoryTree,
	setItemCategories,
	updateCategory,
} from "../src";

const ownerId = "categories-owner";
const workspaceId = "00000000-0000-4000-8000-0000000009b1";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000009b2";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Cat Owner', 'cats@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Gems', 'custom'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'custom')`;
});

async function anItem(inWorkspace = workspaceId) {
	const sql = testDbClient();
	const id = crypto.randomUUID();
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, price_cents, currency)
		values (${id}, ${inWorkspace}, 'A gem', 'physical', 'active', 'fixed', 5000, 'USD')
	`;
	return id;
}

describe("a slug belongs to a workspace, not to the platform", () => {
	it("lets two shops both use 'rings'", async () => {
		// 🔴 The prototype made slug globally unique, which means the first shop to
		// create "rings" takes the word from every other shop on the platform.
		await createCategory(workspaceId, { name: "Rings", slug: "rings" });
		await expect(
			createCategory(otherWorkspaceId, { name: "Rings", slug: "rings" }),
		).resolves.toBeTruthy();
	});

	it("still refuses a duplicate within one shop", async () => {
		await createCategory(workspaceId, { name: "Rings", slug: "rings" });
		await expect(
			createCategory(workspaceId, { name: "More rings", slug: "rings" }),
		).rejects.toThrow(CategoryError);
	});
});

describe("cycles", () => {
	it("refuses to make a category its own parent", async () => {
		const cat = await createCategory(workspaceId, {
			name: "Jewellery",
			slug: "jewellery",
		});
		await expect(
			updateCategory(workspaceId, cat.id, { parentId: cat.id }),
		).rejects.toThrow(/cannot contain itself/i);
	});

	it("refuses to move a parent under its own child", async () => {
		// Without this the tree walk never terminates, and the first symptom is a
		// storefront navigation render that hangs.
		const parent = await createCategory(workspaceId, {
			name: "Jewellery",
			slug: "jewellery",
		});
		const child = await createCategory(workspaceId, {
			name: "Rings",
			slug: "rings",
			parentId: parent.id,
		});
		await expect(
			updateCategory(workspaceId, parent.id, { parentId: child.id }),
		).rejects.toThrow(/own children/i);
	});

	it("refuses a parent from another workspace", async () => {
		const foreign = await createCategory(otherWorkspaceId, {
			name: "Theirs",
			slug: "theirs",
		});
		await expect(
			createCategory(workspaceId, {
				name: "Ours",
				slug: "ours",
				parentId: foreign.id,
			}),
		).rejects.toThrow(/does not exist/i);
	});
});

describe("deleting lifts children rather than orphaning them", () => {
	it("re-parents a grandchild to its grandparent", async () => {
		const top = await createCategory(workspaceId, {
			name: "Jewellery",
			slug: "jewellery",
		});
		const middle = await createCategory(workspaceId, {
			name: "Rings",
			slug: "rings",
			parentId: top.id,
		});
		await createCategory(workspaceId, {
			name: "Signet",
			slug: "signet",
			parentId: middle.id,
		});

		await deleteCategory(workspaceId, middle.id);

		const tree = await listCategoryTree(workspaceId);
		expect(tree).toHaveLength(1);
		// Signet moved up to Jewellery, not to the top level.
		expect(tree[0].children.map((child) => child.slug)).toEqual(["signet"]);
	});
});

describe("visibility", () => {
	it("hides a category from a storefront without deleting it", async () => {
		await createCategory(workspaceId, {
			name: "Summer",
			slug: "summer",
			kind: "collection",
			visible: false,
		});
		expect(await listCategoryTree(workspaceId, { visibleOnly: true })).toEqual(
			[],
		);
		// Still there for the operator, so taking a seasonal collection down does
		// not throw away the curation.
		expect(await listCategoryTree(workspaceId)).toHaveLength(1);
	});
});

describe("membership", () => {
	it("puts one item in several categories", async () => {
		const item = await anItem();
		const rings = await createCategory(workspaceId, {
			name: "Rings",
			slug: "rings",
		});
		const cheap = await createCategory(workspaceId, {
			name: "Under 500",
			slug: "under-500",
		});
		expect(
			await setItemCategories(workspaceId, item, [rings.id, cheap.id]),
		).toBe(2);
		expect(await listCategoryItemIds(workspaceId, "rings")).toEqual([item]);
		expect(await listCategoryItemIds(workspaceId, "under-500")).toEqual([item]);
	});

	it("refuses to file an item under another shop's category", async () => {
		const item = await anItem();
		const foreign = await createCategory(otherWorkspaceId, {
			name: "Theirs",
			slug: "theirs",
		});
		await expect(
			setItemCategories(workspaceId, item, [foreign.id]),
		).rejects.toThrow(/does not exist/i);
	});

	it("replaces rather than appends", async () => {
		const item = await anItem();
		const a = await createCategory(workspaceId, { name: "A", slug: "a" });
		const b = await createCategory(workspaceId, { name: "B", slug: "b" });
		await setItemCategories(workspaceId, item, [a.id]);
		await setItemCategories(workspaceId, item, [b.id]);
		expect(await listCategoryItemIds(workspaceId, "a")).toEqual([]);
		expect(await listCategoryItemIds(workspaceId, "b")).toEqual([item]);
	});

	it("counts items once per category in one query", async () => {
		const item = await anItem();
		const rings = await createCategory(workspaceId, {
			name: "Rings",
			slug: "rings",
		});
		await setItemCategories(workspaceId, item, [rings.id]);
		const [node] = await listCategoryTree(workspaceId);
		expect(node.itemCount).toBe(1);
	});
});
