import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createClientAddressCommand,
	createClientCommand,
	deleteClientAddressCommand,
	deleteClientCommand,
	getClientAddressDto,
	getClientRecordDto,
	listClientAddresses,
	listClientRecordsPage,
	updateClientAddressCommand,
	updateClientCommand,
} from "@quickengine/mod-client-records";
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

export function registerClientRecordRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "clients:read",
		module: "client-records",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "clients:write",
		module: "client-records",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "clients.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "clients.write",
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

	app.get("/v1/clients", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listClientRecordsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
			}),
		),
	);
	app.post("/v1/clients", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "clients.create", body);
		return respondMutation(
			c,
			await createClientCommand(context, body, options.uow),
		);
	});
	app.get("/v1/clients/:id", readAccess, readLimit, async (c) => {
		const record = await getClientRecordDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return record
			? respond(c, record)
			: respondError(c, "NOT_FOUND", "The client was not found.", 404);
	});
	app.patch("/v1/clients/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "clients.update", { body, id });
		return respondMutation(
			c,
			await updateClientCommand(context, id, body, options.uow),
		);
	});
	app.delete("/v1/clients/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "clients.delete", { id });
		return respondMutation(
			c,
			await deleteClientCommand(context, id, options.uow),
		);
	});
	app.get("/v1/clients/:id/addresses", readAccess, readLimit, async (c) => {
		const clientId = uuid.parse(c.req.param("id"));
		const client = await getClientRecordDto(
			c.get("authorized").workspaceId,
			clientId,
		);
		if (!client)
			return respondError(c, "NOT_FOUND", "The client was not found.", 404);
		return respond(
			c,
			await listClientAddresses(c.get("authorized").workspaceId, clientId),
		);
	});
	app.post("/v1/clients/:id/addresses", writeAccess, writeLimit, async (c) => {
		const clientId = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "client-addresses.create", {
			body,
			clientId,
		});
		return respondMutation(
			c,
			await createClientAddressCommand(context, clientId, body, options.uow),
		);
	});
	app.get("/v1/addresses/:id", readAccess, readLimit, async (c) => {
		const address = await getClientAddressDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return address
			? respond(c, address)
			: respondError(c, "NOT_FOUND", "The address was not found.", 404);
	});
	app.patch("/v1/addresses/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "client-addresses.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateClientAddressCommand(context, id, body, options.uow),
		);
	});
	app.delete("/v1/addresses/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "client-addresses.delete", { id });
		return respondMutation(
			c,
			await deleteClientAddressCommand(context, id, options.uow),
		);
	});
}
