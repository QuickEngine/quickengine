import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
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
const activeOnlyFor = (c: Context<PlatformEnv>): "active" | undefined => {
	const { principal } = c.get("authorized");
	return principal.kind === "key" && principal.type === "publishable"
		? "active"
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
