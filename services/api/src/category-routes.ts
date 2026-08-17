import {
	CategoryError,
	categoryInputSchema,
	createCategory,
	deleteCategory,
	listCategoryItemIds,
	listCategoryTree,
	listItemCategoryIds,
	setItemCategories,
	updateCategory,
} from "@quickengine/mod-products-services";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * `/v1/categories` — how a catalog is arranged for browsing.
 *
 * Categories and collections share one shape: a category is where a thing
 * belongs, a collection is a curated grouping, and they differ in meaning and
 * nothing else.
 *
 * Reads use `catalog:read`, which a storefront key already carries — navigation
 * is public by definition. Writes need an operator.
 */
const uuid = z.uuid();

function mapCategoryError(c: Context<PlatformEnv>, error: unknown) {
	if (!(error instanceof CategoryError)) return null;
	// A cycle or a taken slug is the caller's mistake, not a server fault.
	const status = error.code === "CATEGORY_NOT_FOUND" ? 404 : 400;
	const code = error.code === "CATEGORY_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT";
	return respondError(c, code, error.message, status);
}

export function registerCategoryRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const read = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		module: "products-services",
		sessionCapability: "workspace.view",
	});
	const write = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:write",
		module: "products-services",
		sessionCapability: "records.write",
	});

	/**
	 * The browsable tree.
	 *
	 * ⚠️ `visibleOnly` defaults to TRUE. The common caller is a storefront
	 * rendering navigation, and defaulting to showing everything would put a
	 * shop's hidden seasonal collection on its live site the first time somebody
	 * forgot a query parameter.
	 */
	app.get("/v1/categories", read, async (c) => {
		const kind = c.req.query("kind");
		return respond(c, {
			items: await listCategoryTree(c.get("authorized").workspaceId, {
				kind: kind === "collection" || kind === "category" ? kind : undefined,
				visibleOnly: c.req.query("includeHidden") !== "true",
			}),
		});
	});

	/** The catalog item ids in one category, for a listing page. */
	app.get("/v1/categories/:slug/items", read, async (c) =>
		respond(c, {
			itemIds: await listCategoryItemIds(
				c.get("authorized").workspaceId,
				c.req.param("slug"),
			),
		}),
	);

	/**
	 * Which categories one item is filed under.
	 *
	 * The read half of `PUT /v1/catalog/:id/categories`, which could replace an
	 * item's categories without any way to see them first.
	 */
	app.get("/v1/catalog/:id/categories", read, async (c) =>
		respond(c, {
			categoryIds: await listItemCategoryIds(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
			),
		}),
	);

	app.post("/v1/categories", write, async (c) => {
		const parsed = categoryInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That category could not be read.",
				400,
				parsed.error.issues,
			);
		}
		try {
			return respond(
				c,
				await createCategory(c.get("authorized").workspaceId, parsed.data),
				201,
			);
		} catch (error) {
			return mapCategoryError(c, error) ?? Promise.reject(error);
		}
	});

	app.patch("/v1/categories/:id", write, async (c) => {
		const parsed = categoryInputSchema
			.partial()
			.safeParse(await c.req.json().catch(() => ({})));
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That category could not be read.",
				400,
				parsed.error.issues,
			);
		}
		try {
			return respond(
				c,
				await updateCategory(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
					parsed.data,
				),
			);
		} catch (error) {
			return mapCategoryError(c, error) ?? Promise.reject(error);
		}
	});

	app.delete("/v1/categories/:id", write, async (c) => {
		const removed = await deleteCategory(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return removed
			? respond(c, { deleted: true })
			: respondError(c, "NOT_FOUND", "No such category.", 404);
	});

	/** Replace which categories a catalog item belongs to. */
	app.put("/v1/catalog/:id/categories", write, async (c) => {
		const parsed = z
			.object({ categoryIds: z.array(z.uuid()).max(50) })
			.safeParse(await c.req.json().catch(() => ({})));
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Send a list of category ids.",
				400,
				parsed.error.issues,
			);
		}
		try {
			return respond(c, {
				categories: await setItemCategories(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
					parsed.data.categoryIds,
				),
			});
		} catch (error) {
			return mapCategoryError(c, error) ?? Promise.reject(error);
		}
	});
}
