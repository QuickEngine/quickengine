import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createFulfillmentCommand,
	deleteFulfillmentCommand,
	FULFILLMENT_STATUSES,
	getFulfillmentDto,
	listFulfillmentsPage,
	setFulfillmentStatusCommand,
} from "@quickengine/mod-fulfillment";
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
const statusSchema = z.object({ status: z.enum(FULFILLMENT_STATUSES) });

export function registerFulfillmentRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "fulfillment:read",
		module: "fulfillment",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "fulfillment:write",
		module: "fulfillment",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "fulfillments.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "fulfillments.write",
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

	app.get("/v1/fulfillments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listFulfillmentsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/fulfillments", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "fulfillments.create", body);
		return respondMutation(
			c,
			await createFulfillmentCommand(context, body, options.uow),
		);
	});
	app.get("/v1/fulfillments/:id", readAccess, readLimit, async (c) => {
		const fulfillment = await getFulfillmentDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return fulfillment
			? respond(c, fulfillment)
			: respondError(c, "NOT_FOUND", "The delivery was not found.", 404);
	});
	app.post(
		"/v1/fulfillments/:id/status",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const { status } = statusSchema.parse(await c.req.json());
			const context = await mutationContext(c, "fulfillments.set-status", {
				id,
				status,
			});
			return respondMutation(
				c,
				await setFulfillmentStatusCommand(context, id, status, options.uow),
			);
		},
	);
	app.delete("/v1/fulfillments/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "fulfillments.delete", { id });
		return respondMutation(
			c,
			await deleteFulfillmentCommand(context, id, options.uow),
		);
	});
}
