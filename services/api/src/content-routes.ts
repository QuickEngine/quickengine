import {
	contentEntryInputSchema,
	contentManifestInputSchema,
	contentPublishInputSchema,
	deleteContentEntry,
	getPublishedContent,
	listAllContent,
	listPublishedContent,
	registerContentManifest,
	setContentPublished,
	upsertContentEntry,
} from "@quickengine/mod-content";
import type { Hono } from "hono";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * `/v1/content` — the words on a workspace's own website.
 *
 * Two audiences, two access levels, and the split is the whole security model:
 *
 * · **Reading published content** uses `catalog:read`, which a storefront key
 *   already carries. This is copy meant for a public web page, so there is
 *   nothing to protect — but a DRAFT is something the business has deliberately
 *   not said yet, and the read path filters those out in SQL.
 * · **Everything else** needs an operator. Writing copy, publishing it, and
 *   seeing drafts are all `records.write` or `workspace.view`.
 *
 * 🔴 This module does NOT model pages. No structure, no ordering, no component
 * tree. A developer declares named slots; the operator fills them. See
 * `internal/planning/CONTENT_MODULE.md` for why the first attempt at this
 * drowned.
 */
export function registerContentRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const publicRead = authorizeWorkspace(options.platform, {
		// Shares the storefront's existing capability rather than inventing one: a
		// site that may read the catalog may read the words around it.
		keyCapability: "catalog:read",
		module: "content",
		sessionCapability: "workspace.view",
	});
	const operatorRead = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		module: "content",
		sessionCapability: "workspace.view",
	});
	const operatorWrite = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:write",
		module: "content",
		sessionCapability: "records.write",
	});

	/**
	 * Every published slot, as a map.
	 *
	 * Keyed by slot name because that is how a template consumes it —
	 * `content["about.body"]`. Returning a list would make every caller build
	 * this map themselves, on every page render.
	 */
	app.get("/v1/content", publicRead, async (c) =>
		respond(c, {
			content: await listPublishedContent(c.get("authorized").workspaceId),
		}),
	);

	/** One published slot. For a page that needs a single value. */
	app.get("/v1/content/:key", publicRead, async (c) => {
		const value = await getPublishedContent(
			c.get("authorized").workspaceId,
			c.req.param("key"),
		);
		// 404 for both "no such slot" and "not published yet". A public caller
		// learning that an unpublished draft exists is a small leak of intent.
		return value === null
			? respondError(c, "NOT_FOUND", "No published content at that key.", 404)
			: respond(c, { value });
	});

	/**
	 * Every slot including drafts, with labels and groups.
	 *
	 * ⚠️ The only route that exposes unpublished content, which is why it is
	 * operator-only and separate from the public read above rather than the same
	 * handler with a flag.
	 */
	app.get("/v1/content/manage/all", operatorRead, async (c) =>
		respond(c, {
			items: await listAllContent(c.get("authorized").workspaceId),
		}),
	);

	/** Create or update one slot. */
	app.put("/v1/content/manage/:key", operatorWrite, async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = contentEntryInputSchema.safeParse({
			...body,
			// The path is authoritative. A body naming a different key would let one
			// request edit a slot the URL did not name.
			key: c.req.param("key"),
		});
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That content entry could not be read.",
				400,
				parsed.error.issues,
			);
		}
		return respond(
			c,
			await upsertContentEntry(c.get("authorized").workspaceId, parsed.data),
		);
	});

	/**
	 * Register a whole site's slots at once.
	 *
	 * The agency path: a developer declares every editable slot when building a
	 * client's site, so the operator's form arrives populated with labels and
	 * groups instead of empty. Existing values survive — a redeploy must never
	 * wipe the words its owner wrote.
	 */
	app.post("/v1/content/manage/manifest", operatorWrite, async (c) => {
		const parsed = contentManifestInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"A manifest needs a list of slots.",
				400,
				parsed.error.issues,
			);
		}
		return respond(
			c,
			await registerContentManifest(
				c.get("authorized").workspaceId,
				parsed.data.slots,
			),
		);
	});

	/** Publish or unpublish, without touching the words. */
	app.post("/v1/content/manage/publish", operatorWrite, async (c) => {
		const parsed = contentPublishInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Publishing needs a list of keys and a published flag.",
				400,
				parsed.error.issues,
			);
		}
		return respond(c, {
			updated: await setContentPublished(
				c.get("authorized").workspaceId,
				parsed.data.keys,
				parsed.data.published,
			),
		});
	});

	app.delete("/v1/content/manage/:key", operatorWrite, async (c) => {
		const removed = await deleteContentEntry(
			c.get("authorized").workspaceId,
			c.req.param("key"),
		);
		return removed
			? respond(c, { deleted: true })
			: respondError(c, "NOT_FOUND", "No content at that key.", 404);
	});
}
