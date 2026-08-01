import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createContractCommand,
	deleteDraftContractCommand,
	expireContractCommand,
	getContractDto,
	listContractsPage,
	reviseContractCommand,
	sendContractCommand,
	updateDraftContractCommand,
	voidContractCommand,
} from "@quickengine/mod-contracts-esign";
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

export function registerContractsRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "contracts:read",
		module: "contracts-esign",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "contracts:write",
		module: "contracts-esign",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "contracts.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "contracts.write",
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

	app.get("/v1/contracts", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listContractsPage(c.get("authorized").workspaceId, {
				clientId: c.req.query("clientId"),
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/contracts", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "contracts.create", body);
		return respondMutation(
			c,
			await createContractCommand(context, body, options.uow),
		);
	});
	app.get("/v1/contracts/:id", readAccess, readLimit, async (c) => {
		// Signer token material is stripped by the module's serializer, never returned here.
		const contract = await getContractDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return contract
			? respond(c, contract)
			: respondError(c, "NOT_FOUND", "The contract was not found.", 404);
	});
	app.patch("/v1/contracts/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "contracts.update", { body, id });
		return respondMutation(
			c,
			await updateDraftContractCommand(context, id, body, options.uow),
		);
	});
	/**
	 * Sending mints a signing link per signer. The response carries invitation metadata only —
	 * raw tokens are dropped before the result is stored for replay. See the module command.
	 */
	app.post("/v1/contracts/:id/send", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json().catch(() => ({}));
		const context = await mutationContext(c, "contracts.send", { body, id });
		return respondMutation(
			c,
			await sendContractCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/contracts/:id/expire", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "contracts.expire", { id });
		return respondMutation(
			c,
			await expireContractCommand(context, id, {}, options.uow),
		);
	});
	app.post("/v1/contracts/:id/void", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "contracts.void", { id });
		return respondMutation(
			c,
			await voidContractCommand(context, id, {}, options.uow),
		);
	});
	app.post("/v1/contracts/:id/revise", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "contracts.revise", { id });
		return respondMutation(
			c,
			await reviseContractCommand(context, id, options.uow),
		);
	});
	app.delete("/v1/contracts/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "contracts.delete", { id });
		return respondMutation(
			c,
			await deleteDraftContractCommand(context, id, options.uow),
		);
	});
}
