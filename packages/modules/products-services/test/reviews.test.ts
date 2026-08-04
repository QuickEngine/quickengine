import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createReview,
	listOwnReviews,
	listPublishedReviews,
	listReviewsForModeration,
	moderateReview,
	ReviewError,
	reviewSummary,
} from "../src";

const ownerId = "review-owner";
const workspaceId = "00000000-0000-4000-8000-00000000a001";
const otherWorkspaceId = "00000000-0000-4000-8000-00000000a002";
const sam = "00000000-0000-4000-8000-00000000a003";
const pat = "00000000-0000-4000-8000-00000000a004";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Rev Owner', 'rev@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Gems', 'custom'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'custom')`;
	await sql`
		insert into client_records (id, workspace_id, name, email) values
		(${sam}, ${workspaceId}, 'Sam Rivera', 'sam@example.com'),
		(${pat}, ${workspaceId}, 'Pat', 'pat@example.com')
	`;
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

async function anOrderContaining(clientId: string, itemId: string) {
	const sql = testDbClient();
	const orderId = crypto.randomUUID();
	await sql`
		insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, tax_cents, total_cents, status)
		values (${orderId}, ${workspaceId}, ${clientId}, 'Buyer', ${Math.floor(Math.random() * 1_000_000)}, ${`ORD-${orderId.slice(0, 8)}`}, 'USD', 5000, 0, 5000, 'placed')
	`;
	// Every NOT NULL column with no default — `position` included, or the insert
	// fails on a constraint instead of testing what it means to test.
	await sql`
		insert into order_line_items (id, order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (${crypto.randomUUID()}, ${orderId}, ${itemId}, 'A gem', 'physical', 1, 5000, 5000, 0)
	`;
	return orderId;
}

describe("nothing is public until an operator says so", () => {
	it("creates every review pending, never published", async () => {
		const item = await anItem();
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5, body: "Lovely" },
		});
		expect(created.status).toBe("pending");
		// 🔴 The storefront cannot see it.
		expect(await listPublishedReviews(workspaceId, item)).toEqual([]);
	});

	it("shows it only after publishing", async () => {
		const item = await anItem();
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5, body: "Lovely" },
		});
		await moderateReview({
			workspaceId,
			reviewId: created.id,
			status: "published",
			moderatedByUserId: ownerId,
		});
		const shown = await listPublishedReviews(workspaceId, item);
		expect(shown).toHaveLength(1);
		expect(shown[0].body).toBe("Lovely");
	});

	it("keeps a rejected review out of the storefront but on the record", async () => {
		const item = await anItem();
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 1, body: "unfair slander" },
		});
		await moderateReview({
			workspaceId,
			reviewId: created.id,
			status: "rejected",
			moderatedByUserId: ownerId,
			note: "Abusive",
		});
		expect(await listPublishedReviews(workspaceId, item)).toEqual([]);
		// Rejected, not deleted — a shop removing what it dislikes leaves a trail.
		const rejected = await listReviewsForModeration(workspaceId, {
			status: "rejected",
		});
		expect(rejected).toHaveLength(1);
		expect(rejected[0].moderationNote).toBe("Abusive");
		expect(rejected[0].moderatedByUserId).toBe(ownerId);
	});
});

describe("a customer sees their own pending review", () => {
	it("reports its status rather than hiding it", async () => {
		// Somebody who cannot find their review deserves to know it is waiting,
		// not to assume it was thrown away.
		const item = await anItem();
		await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 4 },
		});
		const own = await listOwnReviews(workspaceId, sam);
		expect(own).toHaveLength(1);
		expect(own[0].status).toBe("pending");
	});
});

describe("verified purchase", () => {
	it("badges a review from somebody who actually bought it", async () => {
		const item = await anItem();
		await anOrderContaining(sam, item);
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5 },
		});
		expect(created.verifiedPurchase).toBe(true);
	});

	it("allows a review without a purchase, unbadged", async () => {
		const item = await anItem();
		const created = await createReview({
			workspaceId,
			clientRecordId: pat,
			review: { catalogItemId: item, rating: 3 },
		});
		expect(created.verifiedPurchase).toBe(false);
	});

	it("does not badge from a cancelled order", async () => {
		const sql = testDbClient();
		const item = await anItem();
		const orderId = await anOrderContaining(sam, item);
		await sql`update orders set status = 'cancelled' where id = ${orderId}`;
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5 },
		});
		expect(created.verifiedPurchase).toBe(false);
	});
});

describe("one review per customer per item", () => {
	it("refuses a second review of the same item", async () => {
		// 🔴 Without this, one account can flood a product with ratings and the
		// average — the thing shoppers actually trust — becomes meaningless.
		const item = await anItem();
		await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5 },
		});
		await expect(
			createReview({
				workspaceId,
				clientRecordId: sam,
				review: { catalogItemId: item, rating: 5 },
			}),
		).rejects.toThrow(ReviewError);
	});

	it("allows the same customer to review a different item", async () => {
		const a = await anItem();
		const b = await anItem();
		await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: a, rating: 5 },
		});
		await expect(
			createReview({
				workspaceId,
				clientRecordId: sam,
				review: { catalogItemId: b, rating: 4 },
			}),
		).resolves.toBeTruthy();
	});
});

describe("tenancy", () => {
	it("refuses a review on another workspace's item", async () => {
		const foreign = await anItem(otherWorkspaceId);
		await expect(
			createReview({
				workspaceId,
				clientRecordId: sam,
				review: { catalogItemId: foreign, rating: 5 },
			}),
		).rejects.toThrow(/not available/i);
	});

	it("will not moderate another workspace's review", async () => {
		const item = await anItem();
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5 },
		});
		expect(
			await moderateReview({
				workspaceId: otherWorkspaceId,
				reviewId: created.id,
				status: "published",
				moderatedByUserId: ownerId,
			}),
		).toBe(false);
	});
});

describe("the public author name", () => {
	it("shows a first name and last initial, never an email", async () => {
		const item = await anItem();
		const created = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5 },
		});
		await moderateReview({
			workspaceId,
			reviewId: created.id,
			status: "published",
			moderatedByUserId: ownerId,
		});
		const [shown] = await listPublishedReviews(workspaceId, item);
		expect(shown.authorName).toBe("Sam R.");
		expect(JSON.stringify(shown)).not.toContain("@");
	});
});

describe("rating summary", () => {
	it("averages published reviews only", async () => {
		const item = await anItem();
		const a = await createReview({
			workspaceId,
			clientRecordId: sam,
			review: { catalogItemId: item, rating: 5 },
		});
		await createReview({
			workspaceId,
			clientRecordId: pat,
			review: { catalogItemId: item, rating: 1 },
		});
		await moderateReview({
			workspaceId,
			reviewId: a.id,
			status: "published",
			moderatedByUserId: ownerId,
		});
		// The 1-star is still pending, so it must not drag the average down.
		const summary = await reviewSummary(workspaceId, [item]);
		expect(summary.get(item)).toEqual({ average: 5, count: 1 });
	});

	it("returns nothing for an item with no published reviews", async () => {
		const item = await anItem();
		expect((await reviewSummary(workspaceId, [item])).size).toBe(0);
	});
});
