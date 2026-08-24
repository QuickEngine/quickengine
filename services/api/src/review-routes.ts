import {
	listPublishedReviews,
	listReviewsForModeration,
	listShopReviews,
	moderateReview,
	reviewModerationSchema,
	reviewSummary,
	reviewSummaryInputSchema,
} from "@quickengine/mod-products-services";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

const uuid = z.uuid();

/**
 * `/v1/reviews` — what a storefront shows, and what an operator decides.
 *
 * 🔴 Three audiences, three access levels, and the split is the feature:
 *
 * · **A storefront** reads PUBLISHED reviews with `catalog:read`. It cannot see
 *   a pending one, because the filter is in SQL rather than applied after.
 * · **A customer** writes one through `/v1/customer/reviews` — always `pending`,
 *   never published on write.
 * · **An operator** sees the queue and decides. Only here is an unpublished
 *   review visible, and only here is `moderatedByUserId` recorded.
 */
export function registerReviewRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const publicRead = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		module: "products-services",
		sessionCapability: "workspace.view",
	});
	const operatorRead = authorizeWorkspace(options.platform, {
		// Reading the queue means reading unpublished customer opinion, which is
		// business data rather than catalog data.
		keyCapability: "clients:read",
		module: "products-services",
		sessionCapability: "workspace.view",
	});
	const operatorWrite = authorizeWorkspace(options.platform, {
		keyCapability: "clients:write",
		module: "products-services",
		sessionCapability: "records.write",
	});

	/** Published reviews for one product. */
	/**
	 * What people say about the SHOP.
	 *
	 * 🔴 The only public read was per-product, so a seller's imported ratings had
	 * nowhere to be shown — they passed moderation and then sat unreachable.
	 */
	app.get("/v1/reviews", publicRead, async (c) =>
		respond(c, {
			items: await listShopReviews(
				c.get("authorized").workspaceId,
				Number(c.req.query("limit") ?? 50),
			),
		}),
	);

	app.get("/v1/catalog/:id/reviews", publicRead, async (c) =>
		respond(c, {
			items: await listPublishedReviews(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
				Number(c.req.query("limit") ?? 50),
			),
		}),
	);

	/**
	 * Rating summaries for a set of products, for a listing page.
	 *
	 * Batched because a shop page showing 24 products would otherwise make 24
	 * requests from a browser to render 24 star ratings.
	 */
	app.post("/v1/reviews/summary", publicRead, async (c) => {
		const parsed = reviewSummaryInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Send the catalog item ids to summarise.",
				400,
				parsed.error.issues,
			);
		}
		const summary = await reviewSummary(
			c.get("authorized").workspaceId,
			parsed.data.catalogItemIds,
		);
		return respond(c, { summaries: Object.fromEntries(summary) });
	});

	// ── Moderation ──────────────────────────────────────────────────────────

	/**
	 * The queue.
	 *
	 * ⚠️ Oldest first. A queue worked newest-first leaves the oldest complaint
	 * sitting longest, which is exactly backwards for the person waiting.
	 */
	app.get("/v1/reviews/moderation", operatorRead, async (c) => {
		const status = c.req.query("status");
		return respond(c, {
			items: await listReviewsForModeration(c.get("authorized").workspaceId, {
				status:
					status === "published" ||
					status === "rejected" ||
					status === "pending"
						? status
						: "pending",
				limit: Number(c.req.query("limit") ?? 50),
			}),
		});
	});

	/** Publish or reject one review. */
	app.post("/v1/reviews/:id/moderate", operatorWrite, async (c) => {
		const parsed = reviewModerationSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Say whether to publish or reject it.",
				400,
				parsed.error.issues,
			);
		}

		const authorized = c.get("authorized");
		// 🔴 Who decided. An API key has no human behind it, so its id is recorded
		// instead — the point is that the decision is attributable to something,
		// not that it is always a person.
		const actor =
			authorized.principal.kind === "session"
				? authorized.principal.userId
				: `key:${authorized.principal.keyId}`;

		const moderated = await moderateReview({
			workspaceId: authorized.workspaceId,
			reviewId: uuid.parse(c.req.param("id")),
			status: parsed.data.status,
			moderatedByUserId: actor,
			note: parsed.data.note ?? null,
		});

		return moderated
			? respond(c, { moderated: true, status: parsed.data.status })
			: respondError(c, "NOT_FOUND", "No such review.", 404);
	});
}
