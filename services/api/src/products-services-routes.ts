import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	catalogAvailabilityInputSchema,
	inventorySettingsSchema,
	listCatalogAvailability,
} from "@quickengine/mod-inventory";
import {
	CATALOG_ITEM_STATUSES,
	createCatalogItemCommand,
	createProductVariantCommand,
	deleteCatalogItemCommand,
	deleteProductVariantCommand,
	getCatalogItemDto,
	getVariantDto,
	listCatalogItemsPage,
	listItemVariants,
	setCatalogItemStatusCommand,
	setProductVariantStatusCommand,
	updateCatalogItemCommand,
	updateProductVariantCommand,
	VARIANT_STATUSES,
} from "@quickengine/mod-products-services";
import { getWorkspaceModules } from "@quickengine/module-registry";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

const uuid = z.uuid();
const itemStatusSchema = z.object({ status: z.enum(CATALOG_ITEM_STATUSES) });
const variantStatusSchema = z.object({ status: z.enum(VARIANT_STATUSES) });

// Publishable keys ship in public storefronts (any framework, via connected sites), so their
// catalog reads are clamped to active/published items and variants. Secret keys and sessions
// are the admin surface and may read every status.
export const browserCatalogStatus = (
	type: "publishable" | "storefront" | "secret" | "scoped" | undefined,
): "active" | undefined =>
	type === "publishable" || type === "storefront" ? "active" : undefined;

const activeOnlyFor = (c: Context<PlatformEnv>): "active" | undefined => {
	const { principal } = c.get("authorized");
	return principal.kind === "key"
		? browserCatalogStatus(principal.type)
		: undefined;
};

export function registerProductsServicesRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		module: "products-services",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:write",
		module: "products-services",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "catalog.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "catalog.write",
	});

	const mutationContext = async (
		c: Context<PlatformEnv>,
		operation: string,
		canonicalInput: unknown,
	) =>
		buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput,
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation,
			requestId: c.get("requestId"),
		});

	app.get("/v1/catalog", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listCatalogItemsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				status: activeOnlyFor(c) ?? c.req.query("status"),
			}),
		),
	);
	app.post("/v1/catalog", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "catalog-items.create", body);
		return respondMutation(
			c,
			await createCatalogItemCommand(context, body, options.uow),
		);
	});
	app.post("/v1/catalog/availability", readAccess, readLimit, async (c) => {
		const parsed = catalogAvailabilityInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Send between one and 100 catalog item IDs.",
				400,
				parsed.error.issues,
			);
		}
		const workspaceId = c.get("authorized").workspaceId;
		const inventoryModule = (await getWorkspaceModules(workspaceId)).find(
			(module) => module.id === "inventory" && module.enabled,
		);
		const inventorySettings = inventorySettingsSchema.parse(
			inventoryModule?.settings ?? {},
		);
		return respond(
			c,
			await listCatalogAvailability(workspaceId, parsed.data.catalogItemIds, {
				allowNegativeStock:
					Boolean(inventoryModule) && inventorySettings.allowNegativeStock,
			}),
		);
	});
	app.get("/v1/catalog/:id", readAccess, readLimit, async (c) => {
		const item = await getCatalogItemDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
			activeOnlyFor(c),
		);
		return item
			? respond(c, item)
			: respondError(c, "NOT_FOUND", "The catalog item was not found.", 404);
	});
	app.patch("/v1/catalog/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "catalog-items.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateCatalogItemCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/catalog/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = itemStatusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "catalog-items.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setCatalogItemStatusCommand(context, id, status, options.uow),
		);
	});
	app.delete("/v1/catalog/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "catalog-items.delete", { id });
		return respondMutation(
			c,
			await deleteCatalogItemCommand(context, id, options.uow),
		);
	});
	/**
	 * Catalog images.
	 *
	 * ── Why these live under `/v1/quickdash` ─────────────────────────────────
	 *
	 * They take a multipart upload, and the OpenAPI document this repository
	 * generates models JSON bodies only — a `/v1/catalog/*` mutation without a
	 * documented request schema fails the completeness test. `/v1/quickdash/*` is
	 * the operator console's namespace and is excluded, which is the same reason
	 * `/v1/quickdash/files/upload` sits there. Exposing image upload on the public
	 * API needs multipart support in the doc generator first; recorded as debt.
	 *
	 * 🔴 Images go to the PUBLIC asset store, never to `files`. A product
	 * photograph is served by an `<img>` tag on a customer's own website and
	 * needs a permanent URL; `files` deliberately returns short-lived signed URLs
	 * because it holds contracts.
	 *
	 * The list lives in `metadata.images` because that is the key the storefront
	 * adapter already reads. Writes go through the same durable command as any
	 * other catalog edit, so an uploaded image lands with audit and outbox
	 * exactly like a price change.
	 */
	const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

	/** Provider for things the public web reads. Loaded lazily — hard rule 12. */
	const publicAssets = async (origin: string) => {
		const { createLocalStorageProvider, createVercelBlobStorageProvider } =
			await import("@quickengine/storage");
		// 🔴 A SEPARATE Blob store from the private one, not a flag on it: public
		// and private access is fixed per store at creation. Separate credentials
		// mean a signed contract has no route into the public store at all.
		return process.env.PUBLIC_BLOB_READ_WRITE_TOKEN ||
			process.env.PUBLIC_BLOB_STORE_ID
			? createVercelBlobStorageProvider({
					token: process.env.PUBLIC_BLOB_READ_WRITE_TOKEN,
					oidcToken: process.env.VERCEL_OIDC_TOKEN,
					storeId: process.env.PUBLIC_BLOB_STORE_ID,
				})
			: createLocalStorageProvider(origin);
	};

	const imagesOf = (metadata: unknown) => {
		const value = (metadata as { images?: unknown } | null)?.images;
		return Array.isArray(value)
			? value.filter((entry): entry is string => typeof entry === "string")
			: [];
	};

	const saveImages = async (
		c: Context<PlatformEnv>,
		id: string,
		metadata: Record<string, unknown>,
		images: string[],
	) => {
		const body = { metadata: { ...metadata, images } };
		const context = await mutationContext(c, "catalog-items.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateCatalogItemCommand(context, id, body, options.uow),
		);
	};

	app.post(
		"/v1/quickdash/catalog/:id/images",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const workspaceId = c.get("authorized").workspaceId;
			const form = await c.req.formData();
			const file = form.get("file");
			if (!(file instanceof File) || file.size === 0) {
				return respondError(c, "VALIDATION_ERROR", "Choose an image.", 400);
			}
			if (!file.type.startsWith("image/")) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"That file is not an image.",
					400,
				);
			}
			if (file.size > MAX_IMAGE_BYTES) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"Images must be 10 MB or smaller.",
					400,
				);
			}

			const item = await getCatalogItemDto(workspaceId, id, activeOnlyFor(c));
			if (!item) {
				return respondError(
					c,
					"NOT_FOUND",
					"The catalog item was not found.",
					404,
				);
			}

			// 🔴 The uploaded name is never trusted into the key. It reaches a shared
			// public namespace, so it is reduced to safe characters and prefixed with
			// the item id and a timestamp — which also stops two photographs called
			// `IMG_0001.jpg` overwriting each other.
			const safeName =
				file.name
					.toLowerCase()
					.replace(/[^a-z0-9.]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(-60) || "image";
			const provider = await publicAssets(new URL(c.req.url).origin);
			const asset = await provider.putPublicAsset({
				workspaceId,
				key: `catalog/${id}/${Date.now()}-${safeName}`,
				body: new Uint8Array(await file.arrayBuffer()),
				contentType: file.type,
			});

			return saveImages(c, id, item.metadata ?? {}, [
				...imagesOf(item.metadata),
				asset.url,
			]);
		},
	);

	/** Reorder, or drop one. The first image is the one a storefront shows. */
	app.put(
		"/v1/quickdash/catalog/:id/images",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const { images } = z
				.object({ images: z.array(z.string().url()).max(24) })
				.parse(await c.req.json());
			const item = await getCatalogItemDto(
				c.get("authorized").workspaceId,
				id,
				activeOnlyFor(c),
			);
			if (!item) {
				return respondError(
					c,
					"NOT_FOUND",
					"The catalog item was not found.",
					404,
				);
			}
			// ⚠️ Only images already on this item may be reordered. Without this the
			// endpoint would happily write any url a caller supplied into a product
			// page — an open redirect for image sources.
			const known = new Set(imagesOf(item.metadata));
			const kept = images.filter((url) => known.has(url));
			return saveImages(c, id, item.metadata ?? {}, kept);
		},
	);

	app.get("/v1/catalog/:id/variants", readAccess, readLimit, async (c) => {
		const itemId = uuid.parse(c.req.param("id"));
		const activeOnly = activeOnlyFor(c);
		const item = await getCatalogItemDto(
			c.get("authorized").workspaceId,
			itemId,
			activeOnly,
		);
		if (!item)
			return respondError(
				c,
				"NOT_FOUND",
				"The catalog item was not found.",
				404,
			);
		return respond(
			c,
			await listItemVariants(
				c.get("authorized").workspaceId,
				itemId,
				activeOnly,
			),
		);
	});
	app.post("/v1/catalog/:id/variants", writeAccess, writeLimit, async (c) => {
		const itemId = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "product-variants.create", {
			body,
			itemId,
		});
		return respondMutation(
			c,
			await createProductVariantCommand(context, itemId, body, options.uow),
		);
	});
	app.get("/v1/variants/:id", readAccess, readLimit, async (c) => {
		const variant = await getVariantDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
			activeOnlyFor(c),
		);
		return variant
			? respond(c, variant)
			: respondError(c, "NOT_FOUND", "The variant was not found.", 404);
	});
	app.patch("/v1/variants/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "product-variants.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateProductVariantCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/variants/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = variantStatusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "product-variants.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setProductVariantStatusCommand(context, id, status, options.uow),
		);
	});
	app.delete("/v1/variants/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "product-variants.delete", { id });
		return respondMutation(
			c,
			await deleteProductVariantCommand(context, id, options.uow),
		);
	});
}
