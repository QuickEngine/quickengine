import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	createOrderCommand,
	deleteOrderCommand,
	ensureOrderFulfillmentCommand,
	getOrderDto,
	listOrdersPage,
	ORDER_STATUSES,
	setOrderStatusCommand,
	updateDraftOrderCommand,
} from "@quickengine/mod-orders";
import { getOrderPaymentSummary } from "@quickengine/mod-payments";
import { listShipments } from "@quickengine/mod-shipping";
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
const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

type OperatorOrderLoaders = {
	getOrder: typeof getOrderDto;
	getPayment: typeof getOrderPaymentSummary;
	getShipments: typeof listShipments;
};

const operatorOrderLoaders: OperatorOrderLoaders = {
	getOrder: getOrderDto,
	getPayment: getOrderPaymentSummary,
	getShipments: listShipments,
};

/** One operator-safe order view: commercial terms, settlement and delivery. */
export async function loadOperatorOrderDetail(
	workspaceId: string,
	id: string,
	loaders: OperatorOrderLoaders = operatorOrderLoaders,
) {
	const order = await loaders.getOrder(workspaceId, id);
	if (!order) return null;
	const [payment, shipmentRows] = await Promise.all([
		loaders.getPayment(workspaceId, id),
		loaders.getShipments(workspaceId, id),
	]);
	return {
		...order,
		payment,
		shipments: shipmentRows.map((shipment) => ({
			id: shipment.id,
			status: shipment.status,
			carrier: shipment.carrier,
			serviceLevel: shipment.serviceLevel,
			trackingNumber: shipment.trackingNumber,
			trackingUrl: shipment.trackingUrl,
			createdAt: shipment.createdAt.toISOString(),
			shippedAt: shipment.shippedAt?.toISOString() ?? null,
			inTransitAt: shipment.inTransitAt?.toISOString() ?? null,
			deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
		})),
	};
}

export function registerOrdersRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "orders:read",
		module: "orders",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "orders:write",
		module: "orders",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "orders.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "orders.write",
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

	app.get("/v1/orders", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listOrdersPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/orders", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "orders.create", body);
		return respondMutation(
			c,
			await createOrderCommand(context, body, options.uow),
		);
	});
	app.get("/v1/orders/:id", readAccess, readLimit, async (c) => {
		const order = await loadOperatorOrderDetail(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return order
			? respond(c, order)
			: respondError(c, "NOT_FOUND", "The order was not found.", 404);
	});
	app.patch("/v1/orders/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "orders.update", { body, id });
		return respondMutation(
			c,
			await updateDraftOrderCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/orders/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "orders.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setOrderStatusCommand(context, id, status, options.uow),
		);
	});
	app.post("/v1/orders/:id/fulfillment", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "orders.ensure-fulfillment", {
			id,
		});
		return respondMutation(
			c,
			await ensureOrderFulfillmentCommand(context, id, options.uow),
		);
	});
	app.delete("/v1/orders/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "orders.delete", { id });
		return respondMutation(
			c,
			await deleteOrderCommand(context, id, options.uow),
		);
	});
}
