import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	BOOKING_STATUSES,
	createBookingCommand,
	deleteBookingCommand,
	getBookingDto,
	listBookingsPage,
	setBookingStatusCommand,
	updateBookingCommand,
} from "@quickengine/mod-bookings";
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
	status: z.enum(BOOKING_STATUSES),
	cancellationReason: z.string().trim().max(500).nullable().optional(),
});

export function registerBookingsRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "bookings:read",
		module: "bookings",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "bookings:write",
		module: "bookings",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "bookings.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "bookings.write",
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

	app.get("/v1/bookings", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listBookingsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				from: c.req.query("from"),
				limit: c.req.query("limit"),
				scheduleKey: c.req.query("scheduleKey"),
				status: c.req.query("status"),
				to: c.req.query("to"),
			}),
		),
	);
	app.post("/v1/bookings", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "bookings.create", body);
		return respondMutation(
			c,
			await createBookingCommand(context, body, options.uow),
		);
	});
	app.get("/v1/bookings/:id", readAccess, readLimit, async (c) => {
		const booking = await getBookingDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return booking
			? respond(c, booking)
			: respondError(c, "NOT_FOUND", "The booking was not found.", 404);
	});
	app.patch("/v1/bookings/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "bookings.update", { body, id });
		return respondMutation(
			c,
			await updateBookingCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/bookings/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status, cancellationReason } = statusSchema.parse(
			await c.req.json(),
		);
		const context = await mutationContext(c, "bookings.set-status", {
			cancellationReason,
			id,
			status,
		});
		return respondMutation(
			c,
			await setBookingStatusCommand(
				context,
				id,
				status,
				{ cancellationReason },
				options.uow,
			),
		);
	});
	app.delete("/v1/bookings/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "bookings.delete", { id });
		return respondMutation(
			c,
			await deleteBookingCommand(context, id, options.uow),
		);
	});
}
