import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	applyInventoryAdjustmentCommand,
	createInventoryItemCommand,
	deleteInventoryItemCommand,
	getInventoryItemDto,
	INVENTORY_ITEM_STATUSES,
	inventorySettingsSchema,
	listInventoryAdjustmentsPage,
	listInventoryItemsPage,
	setInventoryItemStatusCommand,
	updateInventoryItemCommand,
} from "@quickengine/mod-inventory";
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
const statusSchema = z.object({ status: z.enum(INVENTORY_ITEM_STATUSES) });

async function inventorySettings(workspaceId: string) {
	const module = (await getWorkspaceModules(workspaceId)).find(
		(candidate) => candidate.id === "inventory" && candidate.enabled,
	);
	return inventorySettingsSchema.parse(module?.settings ?? {});
}

export function registerInventoryRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "inventory:read",
		module: "inventory",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "inventory:write",
		module: "inventory",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "inventory.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "inventory.write",
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

	app.get("/v1/inventory", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listInventoryItemsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/inventory", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "inventory.create", body);
		return respondMutation(
			c,
			await createInventoryItemCommand(context, body, options.uow),
		);
	});
	app.get("/v1/inventory/:id", readAccess, readLimit, async (c) => {
		const item = await getInventoryItemDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return item
			? respond(c, item)
			: respondError(c, "NOT_FOUND", "The stock record was not found.", 404);
	});
	app.patch("/v1/inventory/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "inventory.update", { body, id });
		return respondMutation(
			c,
			await updateInventoryItemCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/inventory/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "inventory.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setInventoryItemStatusCommand(context, id, status, options.uow),
		);
	});
	app.get("/v1/inventory/:id/adjustments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listInventoryAdjustmentsPage(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
				{ limit: c.req.query("limit") },
			),
		),
	);
	app.post(
		"/v1/inventory/:id/adjustments",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const body = await c.req.json();
			const settings = await inventorySettings(c.get("authorized").workspaceId);
			const context = await mutationContext(c, "inventory.adjust", {
				body,
				id,
			});
			return respondMutation(
				c,
				await applyInventoryAdjustmentCommand(
					context,
					id,
					body,
					{ allowNegativeStock: settings.allowNegativeStock },
					options.uow,
				),
			);
		},
	);
	app.delete("/v1/inventory/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "inventory.delete", { id });
		return respondMutation(
			c,
			await deleteInventoryItemCommand(context, id, options.uow),
		);
	});
}
