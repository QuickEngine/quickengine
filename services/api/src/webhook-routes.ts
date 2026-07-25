import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createWebhookEndpointCommand,
	deleteWebhookEndpointCommand,
	getWebhookEndpointDto,
	listWebhookDeliveries,
	listWebhookEndpoints,
	replayWebhookDeliveryCommand,
	updateWebhookEndpointCommand,
} from "@quickengine/event-dispatch";
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

/**
 * Webhook management for a workspace.
 *
 * These are platform routes, not a module's: they are not gated on a QuickDash
 * module being enabled, because subscribing to events is not a business
 * capability a workspace switches on.
 */
export function registerWebhookRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "webhooks:read",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "webhooks:write",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "webhooks.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "webhooks.write",
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

	app.get("/v1/webhook-endpoints", readAccess, readLimit, async (c) =>
		respond(c, await listWebhookEndpoints(c.get("authorized").workspaceId)),
	);

	app.post("/v1/webhook-endpoints", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "webhooks.endpoint.create", body);
		// The response carries the signing secret. It is the only time it is ever
		// returned — there is no route to read it back.
		return respondMutation(
			c,
			await createWebhookEndpointCommand(context, body, options.uow),
		);
	});

	app.get("/v1/webhook-endpoints/:id", readAccess, readLimit, async (c) => {
		const endpoint = await getWebhookEndpointDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return endpoint
			? respond(c, endpoint)
			: respondError(
					c,
					"NOT_FOUND",
					"That webhook endpoint was not found.",
					404,
				);
	});

	app.patch("/v1/webhook-endpoints/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "webhooks.endpoint.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateWebhookEndpointCommand(context, id, body, options.uow),
		);
	});

	app.delete(
		"/v1/webhook-endpoints/:id",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const context = await mutationContext(c, "webhooks.endpoint.delete", {
				id,
			});
			return respondMutation(
				c,
				await deleteWebhookEndpointCommand(context, id, options.uow),
			);
		},
	);

	app.get(
		"/v1/webhook-endpoints/:id/deliveries",
		readAccess,
		readLimit,
		async (c) => {
			const workspaceId = c.get("authorized").workspaceId;
			const endpointId = uuid.parse(c.req.param("id"));
			// Confirm the endpoint belongs to this workspace before listing, so a
			// wrong id reads as "not found" rather than an empty history.
			const endpoint = await getWebhookEndpointDto(workspaceId, endpointId);
			if (!endpoint) {
				return respondError(
					c,
					"NOT_FOUND",
					"That webhook endpoint was not found.",
					404,
				);
			}
			return respond(
				c,
				await listWebhookDeliveries(workspaceId, endpointId, {
					cursor: c.req.query("cursor"),
					limit: Number(c.req.query("limit")) || undefined,
				}),
			);
		},
	);

	app.post(
		"/v1/webhook-deliveries/:id/replay",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const context = await mutationContext(c, "webhooks.delivery.replay", {
				id,
			});
			return respondMutation(
				c,
				await replayWebhookDeliveryCommand(context, id, options.uow),
			);
		},
	);
}
