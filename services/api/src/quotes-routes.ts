import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	acceptQuoteEstimateCommand,
	convertQuoteEstimateToInvoiceCommand,
	convertQuoteEstimateToOrderCommand,
	createQuoteEstimateCommand,
	declineQuoteEstimateCommand,
	deleteQuoteEstimateCommand,
	getQuoteEstimateDto,
	listQuoteEstimatesPage,
	sendQuoteEstimateCommand,
	updateDraftQuoteEstimateCommand,
} from "@quickengine/mod-quotes-estimates";
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
const convertSchema = z.object({ target: z.enum(["invoice", "order"]) });

export function registerQuotesRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "quotes:read",
		module: "quotes-estimates",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "quotes:write",
		module: "quotes-estimates",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "quotes.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "quotes.write",
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

	app.get("/v1/quotes", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listQuoteEstimatesPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/quotes", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "quotes.create", body);
		return respondMutation(
			c,
			await createQuoteEstimateCommand(context, body, options.uow),
		);
	});
	app.get("/v1/quotes/:id", readAccess, readLimit, async (c) => {
		const quote = await getQuoteEstimateDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return quote
			? respond(c, quote)
			: respondError(c, "NOT_FOUND", "The quote was not found.", 404);
	});
	app.patch("/v1/quotes/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "quotes.update", { body, id });
		return respondMutation(
			c,
			await updateDraftQuoteEstimateCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/quotes/:id/send", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "quotes.send", { id });
		return respondMutation(
			c,
			await sendQuoteEstimateCommand(context, id, options.uow),
		);
	});
	app.post("/v1/quotes/:id/accept", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "quotes.accept", { body, id });
		return respondMutation(
			c,
			await acceptQuoteEstimateCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/quotes/:id/decline", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "quotes.decline", { id });
		return respondMutation(
			c,
			await declineQuoteEstimateCommand(context, id, options.uow),
		);
	});
	app.post("/v1/quotes/:id/convert", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { target } = convertSchema.parse(await c.req.json());
		const context = await mutationContext(c, `quotes.convert.${target}`, {
			id,
			target,
		});
		if (target === "invoice") {
			return respondMutation(
				c,
				await convertQuoteEstimateToInvoiceCommand(context, id, options.uow),
			);
		}
		return respondMutation(
			c,
			await convertQuoteEstimateToOrderCommand(context, id, options.uow),
		);
	});
	app.delete("/v1/quotes/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "quotes.delete", { id });
		return respondMutation(
			c,
			await deleteQuoteEstimateCommand(context, id, options.uow),
		);
	});
}
