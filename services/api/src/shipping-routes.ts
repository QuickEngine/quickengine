import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createShipmentCommand,
	deleteShipmentCommand,
	getShipmentDto,
	listShipmentsPage,
	SHIPMENT_STATUSES,
	setShipmentStatusCommand,
	updateDraftShipmentCommand,
	updateShipmentTrackingCommand,
} from "@quickengine/mod-shipping";
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
const statusSchema = z.object({
	status: z.enum(SHIPMENT_STATUSES),
	requireTracking: z.boolean().optional(),
});

export function registerShippingRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "shipping:read",
		module: "shipping",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "shipping:write",
		module: "shipping",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "shipments.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "shipments.write",
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

	app.get("/v1/shipments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listShipmentsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				orderId: c.req.query("orderId"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/shipments", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "shipments.create", body);
		return respondMutation(
			c,
			await createShipmentCommand(context, body, options.uow),
		);
	});
	app.get("/v1/shipments/:id", readAccess, readLimit, async (c) => {
		const shipment = await getShipmentDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return shipment
			? respond(c, shipment)
			: respondError(c, "NOT_FOUND", "The shipment was not found.", 404);
	});
	app.patch("/v1/shipments/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "shipments.update", { body, id });
		return respondMutation(
			c,
			await updateDraftShipmentCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/shipments/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status, requireTracking } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "shipments.set-status", {
			id,
			requireTracking,
			status,
		});
		return respondMutation(
			c,
			await setShipmentStatusCommand(
				context,
				id,
				status,
				{ requireTracking },
				options.uow,
			),
		);
	});
	app.post("/v1/shipments/:id/tracking", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "shipments.tracking", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateShipmentTrackingCommand(context, id, body, options.uow),
		);
	});
	app.delete("/v1/shipments/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "shipments.delete", { id });
		return respondMutation(
			c,
			await deleteShipmentCommand(context, id, options.uow),
		);
	});
}
