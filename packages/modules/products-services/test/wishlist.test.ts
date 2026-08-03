import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addToWishlist,
	listWishlist,
	mergeWishlist,
	removeFromWishlist,
	WishlistError,
	wishlistCounts,
} from "../src";

const ownerId = "wishlist-owner";
const workspaceId = "00000000-0000-4000-8000-0000000009d1";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000009d2";
const identityId = "00000000-0000-4000-8000-0000000009d3";
const membershipId = "00000000-0000-4000-8000-0000000009d4";
const otherMembershipId = "00000000-0000-4000-8000-0000000009d5";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'W Owner', 'wish@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Gems', 'custom'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'custom')`;
	await sql`insert into customer_identities (id, email) values (${identityId}, 'shopper@example.com')`;
	// The same PERSON, a member of two different shops. This is what proves the
	// lists stay separate.
	await sql`
		insert into workspace_customers (id, workspace_id, identity_id)
		values (${membershipId}, ${workspaceId}, ${identityId}),
		       (${otherMembershipId}, ${otherWorkspaceId}, ${identityId})
	`;
});

async function anItem(inWorkspace = workspaceId, name = "A gem") {
	const sql = testDbClient();
	const id = crypto.randomUUID();
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, price_cents, currency)
		values (${id}, ${inWorkspace}, ${name}, 'physical', 'active', 'fixed', 5000, 'USD')
	`;
	return id;
}

describe("a wishlist belongs to a person AT ONE BUSINESS", () => {
	it("keeps the same shopper's two lists apart", async () => {
		const ours = await anItem(workspaceId, "Our gem");
		const theirs = await anItem(otherWorkspaceId, "Their lamp");

		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: ours },
		});
		await addToWishlist({
			workspaceId: otherWorkspaceId,
			workspaceCustomerId: otherMembershipId,
			item: { catalogItemId: theirs },
		});

		const here = await listWishlist(membershipId);
		expect(here.map((entry) => entry.name)).toEqual(["Our gem"]);
		const there = await listWishlist(otherMembershipId);
		expect(there.map((entry) => entry.name)).toEqual(["Their lamp"]);
	});

	it("refuses to save another shop's item", async () => {
		// 🔴 The membership id alone is not enough. Without the workspace check a
		// caller with a valid session could save a competitor's product and read
		// its name and price back out of their own wishlist.
		const foreign = await anItem(otherWorkspaceId);
		await expect(
			addToWishlist({
				workspaceId,
				workspaceCustomerId: membershipId,
				item: { catalogItemId: foreign },
			}),
		).rejects.toThrow(WishlistError);
	});
});

describe("saving is idempotent", () => {
	it("treats a double-tapped heart as one entry", async () => {
		const item = await anItem();
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item },
		});
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item },
		});
		expect(await listWishlist(membershipId)).toHaveLength(1);
	});

	it("updates the chosen option instead of ignoring it", async () => {
		const sql = testDbClient();
		const item = await anItem();
		const variantId = crypto.randomUUID();
		// Every NOT NULL column with no default — `options` included, or the insert
		// fails on a constraint instead of testing what it means to test.
		await sql`
			insert into catalog_item_variants (id, workspace_id, catalog_item_id, combination_key, options, status)
			values (${variantId}, ${workspaceId}, ${item}, 'size-7', '{"size":"7"}'::jsonb, 'active')
		`;

		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item },
		});
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item, catalogItemVariantId: variantId },
		});

		const [entry] = await listWishlist(membershipId);
		expect(entry.catalogItemVariantId).toBe(variantId);
	});
});

describe("removing", () => {
	it("succeeds even when the item was never saved", async () => {
		// A double-tapped heart must not produce an error a shopper has to
		// understand.
		await expect(
			removeFromWishlist({
				workspaceCustomerId: membershipId,
				catalogItemId: crypto.randomUUID(),
			}),
		).resolves.toBeUndefined();
	});
});

describe("merging a guest's browser list", () => {
	it("adds to what is already saved rather than replacing it", async () => {
		// 🔴 Replacing would throw away what they saved on another device, which is
		// the more valuable half.
		const onPhone = await anItem(workspaceId, "Saved on phone");
		const onLaptop = await anItem(workspaceId, "Saved signed-out");
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: onPhone },
		});

		const result = await mergeWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			items: [{ catalogItemId: onLaptop }],
		});

		expect(result).toEqual({ merged: 1, skipped: 0 });
		const names = (await listWishlist(membershipId)).map((e) => e.name).sort();
		expect(names).toEqual(["Saved on phone", "Saved signed-out"]);
	});

	it("skips dead ids rather than failing the whole merge", async () => {
		// A list carried in a browser for months will always contain one item that
		// has since been withdrawn. Refusing the lot over it would lose the rest.
		const real = await anItem();
		const result = await mergeWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			items: [
				{ catalogItemId: real },
				{ catalogItemId: crypto.randomUUID() },
				{ catalogItemId: await anItem(otherWorkspaceId) },
			],
		});
		expect(result).toEqual({ merged: 1, skipped: 2 });
		expect(await listWishlist(membershipId)).toHaveLength(1);
	});

	it("does not overwrite an existing entry's chosen option", async () => {
		const sql = testDbClient();
		const item = await anItem();
		const variantId = crypto.randomUUID();
		// Every NOT NULL column with no default — `options` included, or the insert
		// fails on a constraint instead of testing what it means to test.
		await sql`
			insert into catalog_item_variants (id, workspace_id, catalog_item_id, combination_key, options, status)
			values (${variantId}, ${workspaceId}, ${item}, 'size-7', '{"size":"7"}'::jsonb, 'active')
		`;
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item, catalogItemVariantId: variantId },
		});

		// The guest list knows nothing about the variant; the stored entry wins.
		await mergeWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			items: [{ catalogItemId: item }],
		});

		const [entry] = await listWishlist(membershipId);
		expect(entry.catalogItemVariantId).toBe(variantId);
	});

	it("does nothing for an empty list", async () => {
		expect(
			await mergeWishlist({
				workspaceId,
				workspaceCustomerId: membershipId,
				items: [],
			}),
		).toEqual({ merged: 0, skipped: 0 });
	});
});

describe("withdrawn items stay visible", () => {
	it("keeps an archived item on the list, labelled", async () => {
		const sql = testDbClient();
		const item = await anItem();
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item },
		});
		await sql`update catalog_items set status = 'archived' where id = ${item}`;

		const [entry] = await listWishlist(membershipId);
		// Present, and honest about being gone — rather than the list quietly
		// getting shorter with no explanation.
		expect(entry.status).toBe("archived");
	});
});

describe("merchandising counts", () => {
	it("counts savers per item, scoped to the workspace", async () => {
		const item = await anItem();
		await addToWishlist({
			workspaceId,
			workspaceCustomerId: membershipId,
			item: { catalogItemId: item },
		});
		const counts = await wishlistCounts(workspaceId, [item]);
		expect(counts.get(item)).toBe(1);
		// Another workspace asking about the same id sees nothing.
		expect((await wishlistCounts(otherWorkspaceId, [item])).size).toBe(0);
	});
});
