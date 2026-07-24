import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	getPaymentDto,
	listPaymentsPage,
	PAYMENT_STATUSES,
	recordPaymentCommand,
	refundPaymentCommand,
	setPaymentStatusCommand,
} from "@quickengine/mod-payments";
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
const statusSchema = z.object({ status: z.enum(PAYMENT_STATUSES) });

export function registerPaymentsRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "payments:read",
		module: "payments",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "payments:write",
		module: "payments",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "payments.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "payments.write",
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

	app.get("/v1/payments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listPaymentsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/payments", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "payments.record", body);
		return respondMutation(
			c,
			await recordPaymentCommand(context, body, options.uow),
		);
	});
	app.get("/v1/payments/:id", readAccess, readLimit, async (c) => {
		const payment = await getPaymentDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return payment
			? respond(c, payment)
			: respondError(c, "NOT_FOUND", "The payment was not found.", 404);
	});
	app.post("/v1/payments/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "payments.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setPaymentStatusCommand(context, id, status, options.uow),
		);
	});
	app.post("/v1/payments/:id/refund", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "payments.refund", { body, id });
		return respondMutation(
			c,
			await refundPaymentCommand(context, id, body, options.uow),
		);
	});
}
