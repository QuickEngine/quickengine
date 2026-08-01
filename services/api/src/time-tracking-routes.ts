import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	approveTimeEntryCommand,
	createManualTimeEntryCommand,
	deleteTimeEntryCommand,
	detachTimeEntriesFromDraftInvoiceCommand,
	getTimeEntryDto,
	invoiceApprovedTimeEntriesCommand,
	listTimeEntriesPage,
	restoreVoidedTimeEntryCommand,
	startTimerCommand,
	stopTimerCommand,
	unapproveTimeEntryCommand,
	updateManualTimeEntryCommand,
	voidTimeEntryCommand,
} from "@quickengine/mod-time-tracking";
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
const stopSchema = z.object({ endedAt: z.coerce.date() });
const approveSchema = z.object({
	mode: z.enum(["nearest", "up", "down"]).optional(),
	incrementMinutes: z.coerce.number().int().positive().max(480).optional(),
});
const invoiceSchema = z.object({
	invoiceId: z.uuid(),
	entryIds: z.array(z.uuid()).min(1),
});

export function registerTimeTrackingRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "time:read",
		module: "time-tracking",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "time:write",
		module: "time-tracking",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "time.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "time.write",
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

	app.get("/v1/time-entries", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listTimeEntriesPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				from: c.req.query("from"),
				limit: c.req.query("limit"),
				projectId: c.req.query("projectId"),
				status: c.req.query("status"),
				taskId: c.req.query("taskId"),
				to: c.req.query("to"),
				trackerKey: c.req.query("trackerKey"),
			}),
		),
	);
	app.post("/v1/time-entries", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "time.create", body);
		return respondMutation(
			c,
			await createManualTimeEntryCommand(context, body, options.uow),
		);
	});
	app.get("/v1/time-entries/:id", readAccess, readLimit, async (c) => {
		const entry = await getTimeEntryDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return entry
			? respond(c, entry)
			: respondError(c, "NOT_FOUND", "The time entry was not found.", 404);
	});
	app.patch("/v1/time-entries/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "time.update", { body, id });
		return respondMutation(
			c,
			await updateManualTimeEntryCommand(context, id, body, options.uow),
		);
	});
	app.delete("/v1/time-entries/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "time.delete", { id });
		return respondMutation(
			c,
			await deleteTimeEntryCommand(context, id, options.uow),
		);
	});

	/* Timers */

	app.post("/v1/timers", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "time.start", body);
		return respondMutation(
			c,
			await startTimerCommand(context, body, {}, options.uow),
		);
	});
	app.post("/v1/timers/:id/stop", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { endedAt } = stopSchema.parse(await c.req.json());
		const context = await mutationContext(c, "time.stop", {
			endedAt: endedAt.toISOString(),
			id,
		});
		return respondMutation(
			c,
			await stopTimerCommand(context, id, endedAt, options.uow),
		);
	});

	/* Approval lifecycle */

	app.post(
		"/v1/time-entries/:id/approve",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const body = approveSchema.parse(await c.req.json().catch(() => ({})));
			const context = await mutationContext(c, "time.approve", { body, id });
			return respondMutation(
				c,
				await approveTimeEntryCommand(context, id, body, options.uow),
			);
		},
	);
	app.post(
		"/v1/time-entries/:id/unapprove",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const context = await mutationContext(c, "time.unapprove", { id });
			return respondMutation(
				c,
				await unapproveTimeEntryCommand(context, id, options.uow),
			);
		},
	);
	app.post("/v1/time-entries/:id/void", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "time.void", { id });
		return respondMutation(
			c,
			await voidTimeEntryCommand(context, id, options.uow),
		);
	});
	app.post(
		"/v1/time-entries/:id/restore",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const context = await mutationContext(c, "time.restore", { id });
			return respondMutation(
				c,
				await restoreVoidedTimeEntryCommand(context, id, options.uow),
			);
		},
	);

	/* Invoicing — writes across the module boundary in one transaction */

	app.post("/v1/time-entries/invoice", writeAccess, writeLimit, async (c) => {
		const { invoiceId, entryIds } = invoiceSchema.parse(await c.req.json());
		const context = await mutationContext(c, "time.invoice", {
			entryIds,
			invoiceId,
		});
		return respondMutation(
			c,
			await invoiceApprovedTimeEntriesCommand(
				context,
				invoiceId,
				entryIds,
				options.uow,
			),
		);
	});
	app.post("/v1/time-entries/detach", writeAccess, writeLimit, async (c) => {
		const { invoiceId, entryIds } = invoiceSchema.parse(await c.req.json());
		const context = await mutationContext(c, "time.detach", {
			entryIds,
			invoiceId,
		});
		return respondMutation(
			c,
			await detachTimeEntriesFromDraftInvoiceCommand(
				context,
				invoiceId,
				entryIds,
				options.uow,
			),
		);
	});
}
