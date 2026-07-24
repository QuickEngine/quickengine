import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createInvoiceCommand,
	deleteInvoiceCommand,
	getInvoiceDto,
	INVOICE_STATUSES,
	listInvoicesPage,
	setInvoiceStatusCommand,
	updateDraftInvoiceCommand,
} from "@quickengine/mod-invoicing";
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
const statusSchema = z.object({ status: z.enum(INVOICE_STATUSES) });

export function registerInvoicesRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "invoicing:read",
		module: "invoicing",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "invoicing:write",
		module: "invoicing",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "invoices.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "invoices.write",
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

	app.get("/v1/invoices", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listInvoicesPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/invoices", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "invoices.create", body);
		return respondMutation(
			c,
			await createInvoiceCommand(context, body, options.uow),
		);
	});
	app.get("/v1/invoices/:id", readAccess, readLimit, async (c) => {
		const invoice = await getInvoiceDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return invoice
			? respond(c, invoice)
			: respondError(c, "NOT_FOUND", "The invoice was not found.", 404);
	});
	app.patch("/v1/invoices/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "invoices.update", { body, id });
		return respondMutation(
			c,
			await updateDraftInvoiceCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/invoices/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "invoices.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setInvoiceStatusCommand(context, id, status, options.uow),
		);
	});
	app.delete("/v1/invoices/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "invoices.delete", { id });
		return respondMutation(
			c,
			await deleteInvoiceCommand(context, id, options.uow),
		);
	});
}
