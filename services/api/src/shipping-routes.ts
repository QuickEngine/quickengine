import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createShipmentCommand,
	createShippingRate,
	createShippingZone,
	deleteShipmentCommand,
	deleteShippingRate,
	deleteShippingZone,
	getShipmentDto,
	listShipmentsPage,
	listShippingZones,
	SHIPMENT_STATUSES,
	ShippingRateConfigError,
	setShipmentStatusCommand,
	shippingRateInputSchema,
	shippingSettingsSchema,
	shippingZoneInputSchema,
	updateDraftShipmentCommand,
	updateShipmentTrackingCommand,
	updateShippingRate,
	updateShippingZone,
} from "@quickengine/mod-shipping";
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
const statusSchema = z.object({
	status: z.enum(SHIPMENT_STATUSES),
});

async function shippingSettings(workspaceId: string) {
	const module = (await getWorkspaceModules(workspaceId)).find(
		(candidate) => candidate.id === "shipping" && candidate.enabled,
	);
	return shippingSettingsSchema.parse(module?.settings ?? {});
}

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

	const configError = (c: Context<PlatformEnv>, error: unknown) => {
		if (!(error instanceof ShippingRateConfigError)) throw error;
		const notFound = /NOT_FOUND/.test(error.code);
		return respondError(
			c,
			notFound ? "NOT_FOUND" : "CONFLICT",
			error.message,
			notFound ? 404 : 409,
		);
	};

	/* Zones, rates, and storefront quotes */

	app.get("/v1/shipping/zones", readAccess, readLimit, async (c) =>
		respond(c, {
			items: await listShippingZones(c.get("authorized").workspaceId),
		}),
	);
	app.post("/v1/shipping/zones", writeAccess, writeLimit, async (c) => {
		try {
			return respond(
				c,
				await createShippingZone(
					c.get("authorized").workspaceId,
					shippingZoneInputSchema.parse(await c.req.json()),
				),
				201,
			);
		} catch (error) {
			return configError(c, error);
		}
	});
	app.patch("/v1/shipping/zones/:id", writeAccess, writeLimit, async (c) => {
		try {
			return respond(
				c,
				await updateShippingZone(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
					shippingZoneInputSchema.partial().parse(await c.req.json()),
				),
			);
		} catch (error) {
			return configError(c, error);
		}
	});
	app.delete("/v1/shipping/zones/:id", writeAccess, writeLimit, async (c) => {
		try {
			return respond(
				c,
				await deleteShippingZone(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
				),
			);
		} catch (error) {
			return configError(c, error);
		}
	});
	app.post("/v1/shipping/rates", writeAccess, writeLimit, async (c) => {
		try {
			return respond(
				c,
				await createShippingRate(
					c.get("authorized").workspaceId,
					shippingRateInputSchema.parse(await c.req.json()),
				),
				201,
			);
		} catch (error) {
			return configError(c, error);
		}
	});
	app.patch("/v1/shipping/rates/:id", writeAccess, writeLimit, async (c) => {
		try {
			return respond(
				c,
				await updateShippingRate(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
					shippingRateInputSchema.partial().parse(await c.req.json()),
				),
			);
		} catch (error) {
			return configError(c, error);
		}
	});
	app.delete("/v1/shipping/rates/:id", writeAccess, writeLimit, async (c) => {
		try {
			return respond(
				c,
				await deleteShippingRate(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
				),
			);
		} catch (error) {
			return configError(c, error);
		}
	});
	app.get("/v1/shipments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listShipmentsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
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
		const { status } = statusSchema.parse(await c.req.json());
		const settings = await shippingSettings(c.get("authorized").workspaceId);
		const context = await mutationContext(c, "shipments.set-status", {
			id,
			requireTracking: settings.requireTracking,
			status,
		});
		return respondMutation(
			c,
			await setShipmentStatusCommand(
				context,
				id,
				status,
				{ requireTracking: settings.requireTracking },
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
