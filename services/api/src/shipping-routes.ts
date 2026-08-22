import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	CarrierError,
	carrierConnectionCheckSchema,
	carrierConnectionInputSchema,
	carrierEnvironmentSchema,
	carrierNameSchema,
	createShipmentCommand,
	createShippingRate,
	createShippingZone,
	deleteCarrierConnection,
	deleteShipmentCommand,
	deleteShippingRate,
	deleteShippingZone,
	getShipmentDto,
	getShippingCarrier,
	listCarrierConnections,
	listShipmentsPage,
	listShippingZones,
	resolveCarrierConnection,
	SHIPMENT_STATUSES,
	ShippingRateConfigError,
	saveCarrierConnection,
	setCarrierConnectionState,
	setShipmentStatusCommand,
	shippingRateInputSchema,
	shippingRatePatchSchema,
	shippingSettingsSchema,
	shippingZoneInputSchema,
	shippingZonePatchSchema,
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
import {
	onShipmentCreated,
	onShipmentDispatched,
} from "./order-fulfilment-progress";
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
		// Overridden only by follow-on mutations inside one request, which must not
		// share the request's key or the later ones replay instead of running.
		idempotencyKeyOverride?: string,
	) =>
		buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput,
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey:
				idempotencyKeyOverride ?? c.req.header(API_HEADERS.idempotencyKey),
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

	/* ── Carrier connections ───────────────────────────────────────────────────
	 *
	 * A business brings its OWN carrier account, the same answer Stripe Connect
	 * gave, because that is what makes their negotiated carrier rates carry over.
	 *
	 * 🔴 The token never comes back out. `listCarrierConnections` answers whether
	 * one is present and whether it last worked, never what it is. A screen able
	 * to show it would turn a session hijack into the ability to print labels
	 * billed to that business.
	 */
	app.get("/v1/shipping/carriers", readAccess, readLimit, async (c) =>
		respond(c, {
			items: await listCarrierConnections(c.get("authorized").workspaceId),
		}),
	);

	app.post("/v1/shipping/carriers", writeAccess, writeLimit, async (c) => {
		const body = carrierConnectionInputSchema.parse(await c.req.json());
		const saved = await saveCarrierConnection({
			workspaceId: c.get("authorized").workspaceId,
			carrier: body.carrier,
			environment: body.environment,
			credentials: {
				apiToken: body.apiToken,
				...(body.webhookSecret ? { webhookSecret: body.webhookSecret } : {}),
			},
		});
		// Lands `pending`: nothing has proven the token works, and calling it
		// active before anything has spoken to the carrier is how a broken
		// connection looks healthy on a settings screen.
		return respond(c, { id: saved?.id ?? null, status: "pending" }, 201);
	});

	/**
	 * Ask the carrier whether the token actually works.
	 *
	 * 🔴 Registered BEFORE `/:carrier` below. A param route declared first
	 * captures the literal `check` as a carrier name — the same shadowing that
	 * has broken this repo three times, most recently
	 * `/v1/inventory/supplier-connections` behind `/v1/inventory/:id`.
	 *
	 * ⚠️ Uses `allowUnverified`, because a connection that has never been
	 * checked is exactly what somebody is checking. Without it, saving a token
	 * and immediately testing it reports that no connection exists.
	 */
	app.post(
		"/v1/shipping/carriers/check",
		writeAccess,
		writeLimit,
		async (c) => {
			const body = carrierConnectionCheckSchema.parse(await c.req.json());
			const workspaceId = c.get("authorized").workspaceId;

			const connection = await resolveCarrierConnection({
				workspaceId,
				carrier: body.carrier,
				environment: body.environment,
				allowUnverified: true,
			});
			if (!connection) {
				return respondError(
					c,
					"NOT_FOUND",
					"No carrier account is saved for that mode.",
					404,
				);
			}

			try {
				// Throws `UnsupportedShippingCarrierError` for a carrier with no adapter,
				// which is a truthful answer rather than a pretend success.
				await getShippingCarrier(body.carrier).verifyCredentials({
					credentials: connection.credentials,
				});
				await setCarrierConnectionState({
					workspaceId,
					carrier: body.carrier,
					environment: body.environment,
					ok: true,
				});
				return respond(c, { ok: true, error: null });
			} catch (error) {
				/**
				 * ⚠️ A refusal is recorded, not thrown. The point of a check button is
				 * to put the carrier's own words on screen where somebody can act on
				 * them, and a 500 with a stack trace is not that.
				 */
				const message =
					error instanceof CarrierError
						? error.message
						: error instanceof Error
							? error.message
							: "The carrier could not be reached.";
				await setCarrierConnectionState({
					workspaceId,
					carrier: body.carrier,
					environment: body.environment,
					ok: false,
					error: message,
				});
				return respond(c, { ok: false, error: message });
			}
		},
	);

	app.delete(
		"/v1/shipping/carriers/:carrier",
		writeAccess,
		writeLimit,
		async (c) => {
			const carrier = carrierNameSchema.parse(c.req.param("carrier"));
			const environment = carrierEnvironmentSchema.parse(
				c.req.query("environment") ?? "live",
			);
			const removed = await deleteCarrierConnection({
				workspaceId: c.get("authorized").workspaceId,
				carrier,
				environment,
			});
			if (!removed) {
				return respondError(
					c,
					"NOT_FOUND",
					"No carrier account is saved for that mode.",
					404,
				);
			}
			return respond(c, { deleted: true });
		},
	);

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
					shippingZonePatchSchema.parse(await c.req.json()),
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
					shippingRatePatchSchema.parse(await c.req.json()),
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
		const result = await createShipmentCommand(context, body, options.uow);
		// A parcel exists, so the order is being worked on. Best effort by design.
		// ⚠️ Narrowed: a mutation may come back `conflict` or `in_progress`, and
		// neither carries a result to react to.
		if (result.kind === "success" && result.result.orderId) {
			await onShipmentCreated(
				c.get("authorized").workspaceId,
				result.result.orderId,
				{
					logger: options.logger,
					idempotencyKey: c.req.header(API_HEADERS.idempotencyKey) ?? "",
					mutationContext: (action, payload, key) =>
						mutationContext(c, action, payload, key),
					requestId: c.get("requestId"),
					uow: options.uow,
				},
			);
		}
		return respondMutation(c, result);
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
		const result = await setShipmentStatusCommand(
			context,
			id,
			status,
			{ requireTracking: settings.requireTracking },
			options.uow,
		);
		// A parcel left. If nothing is still owed, the order is done.
		if (result.kind === "success" && result.result.orderId) {
			await onShipmentDispatched(
				c.get("authorized").workspaceId,
				result.result.orderId,
				status,
				{
					logger: options.logger,
					idempotencyKey: c.req.header(API_HEADERS.idempotencyKey) ?? "",
					mutationContext: (action, payload, key) =>
						mutationContext(c, action, payload, key),
					requestId: c.get("requestId"),
					uow: options.uow,
				},
			);
		}
		return respondMutation(c, result);
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
