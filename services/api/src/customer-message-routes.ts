import type { CacheProvider } from "@quickengine/cache";
import {
	appendCustomerMessage,
	createCustomerConversation,
	createOperatorConversation,
	getCustomerConversation,
	getOperatorConversation,
	listConversationMessages,
	listCustomerConversations,
	listOperatorConversations,
	markConversationRead,
	setConversationStatus,
} from "@quickengine/db";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import { authorizeCustomer } from "./customer-authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

export const customerConversationInputSchema = z.object({
	subject: z.string().trim().min(1).max(160),
	body: z.string().trim().min(1).max(10_000),
});

export const operatorConversationInputSchema = customerConversationInputSchema
	.extend({
		workspaceCustomerId: z.uuid().optional(),
		clientRecordId: z.uuid().optional(),
	})
	.refine(
		(value) =>
			Boolean(value.workspaceCustomerId) !== Boolean(value.clientRecordId),
		{
			message: "Choose one customer.",
		},
	);

export const customerMessageInputSchema = z.object({
	body: z.string().trim().min(1).max(10_000),
});

/**
 * Tell the workspace a customer is waiting.
 *
 * 🔴 The ONLY thing that makes the bell ring for a message. Until this existed,
 * a customer could write in and nothing anywhere knew — the conversation
 * appeared in a list somebody had to think to open.
 *
 * ⚠️ Failures are swallowed. A message that saved must not fail because the
 * announcement did; the customer would be told their message did not send when
 * it plainly did. The cost is a missed notification, which the Messages page
 * still shows.
 */
async function announceCustomerMessage(
	c: { get(name: "requestId"): string },
	workspaceId: string,
	conversation: { id: string },
) {
	try {
		const { recordOutboxEvent } = await import("@quickengine/db");
		await recordOutboxEvent({
			workspaceId,
			aggregateType: "customer-conversation",
			aggregateId: conversation.id,
			eventName: "customer.message.received",
			// Identity only. The channel is a notification, not a data feed, and a
			// customer's words do not belong in an event payload that fans out to
			// third-party webhooks.
			payload: { conversationId: conversation.id },
			requestId: c.get("requestId"),
			actorType: "customer",
		});
	} catch {
		// Deliberately silent — see above.
	}
}

export const conversationStatusInputSchema = z.object({
	status: z.enum(["open", "closed"]),
});

const invalid = (c: Parameters<typeof respondError>[0], issues?: unknown) =>
	respondError(
		c,
		"VALIDATION_ERROR",
		"Check the message and try again.",
		400,
		issues,
	);

export function registerCustomerMessageRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "customer-messages.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "customer-messages.write",
	});
	const operatorRead = authorizeWorkspace(options.platform, {
		keyCapability: "clients:read",
		sessionCapability: "workspace.view",
	});
	const operatorWrite = authorizeWorkspace(options.platform, {
		keyCapability: "clients:write",
		sessionCapability: "records.write",
	});
	const customerRead = authorizeCustomer(options.platform, {
		requireSession: true,
	});

	app.get("/v1/customer-conversations", operatorRead, readLimit, async (c) =>
		respond(c, {
			items: await listOperatorConversations(c.get("authorized").workspaceId),
		}),
	);

	app.post(
		"/v1/customer-conversations",
		operatorWrite,
		writeLimit,
		async (c) => {
			const parsed = operatorConversationInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) return invalid(c, parsed.error.issues);
			const authorized = c.get("authorized");
			const conversation = await createOperatorConversation({
				workspaceId: authorized.workspaceId,
				workspaceCustomerId: parsed.data.workspaceCustomerId,
				clientRecordId: parsed.data.clientRecordId,
				operatorUserId:
					authorized.principal.kind === "session"
						? authorized.principal.userId
						: null,
				subject: parsed.data.subject,
				body: parsed.data.body,
			});
			return conversation
				? respond(c, conversation, 201)
				: respondError(
						c,
						"NOT_FOUND",
						"That customer does not have portal access yet.",
						404,
					);
		},
	);

	app.get(
		"/v1/customer-conversations/:id",
		operatorRead,
		readLimit,
		async (c) => {
			const conversation = await getOperatorConversation(
				c.get("authorized").workspaceId,
				c.req.param("id"),
			);
			if (!conversation)
				return respondError(
					c,
					"NOT_FOUND",
					"The conversation was not found.",
					404,
				);
			return respond(c, {
				...conversation,
				messages: await listConversationMessages(conversation.id),
			});
		},
	);

	app.post(
		"/v1/customer-conversations/:id/messages",
		operatorWrite,
		writeLimit,
		async (c) => {
			const parsed = customerMessageInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) return invalid(c, parsed.error.issues);
			const authorized = c.get("authorized");
			const conversation = await getOperatorConversation(
				authorized.workspaceId,
				c.req.param("id"),
			);
			if (!conversation)
				return respondError(
					c,
					"NOT_FOUND",
					"The conversation was not found.",
					404,
				);
			const message = await appendCustomerMessage({
				conversationId: conversation.id,
				sender: "operator",
				operatorUserId:
					authorized.principal.kind === "session"
						? authorized.principal.userId
						: null,
				body: parsed.data.body,
			});
			return respond(c, message, 201);
		},
	);

	app.post(
		"/v1/customer-conversations/:id/read",
		operatorWrite,
		writeLimit,
		async (c) => {
			const conversation = await getOperatorConversation(
				c.get("authorized").workspaceId,
				c.req.param("id"),
			);
			if (!conversation)
				return respondError(
					c,
					"NOT_FOUND",
					"The conversation was not found.",
					404,
				);
			await markConversationRead({
				conversationId: conversation.id,
				reader: "operator",
			});
			return respond(c, { read: true });
		},
	);

	app.patch(
		"/v1/customer-conversations/:id",
		operatorWrite,
		writeLimit,
		async (c) => {
			const parsed = conversationStatusInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) return invalid(c, parsed.error.issues);
			const conversation = await getOperatorConversation(
				c.get("authorized").workspaceId,
				c.req.param("id"),
			);
			if (!conversation)
				return respondError(
					c,
					"NOT_FOUND",
					"The conversation was not found.",
					404,
				);
			return respond(
				c,
				await setConversationStatus({
					conversationId: conversation.id,
					status: parsed.data.status,
				}),
			);
		},
	);

	app.get("/v1/customer/messages", customerRead, readLimit, async (c) => {
		const customer = c.get("customer").customer;
		if (!customer)
			return respondError(c, "AUTHENTICATION_REQUIRED", "Sign in.", 401);
		return respond(c, {
			items: await listCustomerConversations(customer.workspaceCustomerId),
		});
	});

	app.post("/v1/customer/messages", customerRead, writeLimit, async (c) => {
		const parsed = customerConversationInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) return invalid(c, parsed.error.issues);
		const context = c.get("customer");
		if (!context.customer)
			return respondError(c, "AUTHENTICATION_REQUIRED", "Sign in.", 401);
		const conversation = await createCustomerConversation({
			workspaceId: context.workspaceId,
			workspaceCustomerId: context.customer.workspaceCustomerId,
			...parsed.data,
		});
		await announceCustomerMessage(c, context.workspaceId, conversation);
		return respond(c, conversation, 201);
	});

	app.get("/v1/customer/messages/:id", customerRead, readLimit, async (c) => {
		const customer = c.get("customer").customer;
		if (!customer)
			return respondError(c, "AUTHENTICATION_REQUIRED", "Sign in.", 401);
		const conversation = await getCustomerConversation(
			customer.workspaceCustomerId,
			c.req.param("id"),
		);
		if (!conversation)
			return respondError(
				c,
				"NOT_FOUND",
				"The conversation was not found.",
				404,
			);
		return respond(c, {
			...conversation,
			messages: await listConversationMessages(conversation.id),
		});
	});

	app.post(
		"/v1/customer/messages/:id/replies",
		customerRead,
		writeLimit,
		async (c) => {
			const parsed = customerMessageInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) return invalid(c, parsed.error.issues);
			const customer = c.get("customer").customer;
			if (!customer)
				return respondError(c, "AUTHENTICATION_REQUIRED", "Sign in.", 401);
			const conversation = await getCustomerConversation(
				customer.workspaceCustomerId,
				c.req.param("id"),
			);
			if (!conversation)
				return respondError(
					c,
					"NOT_FOUND",
					"The conversation was not found.",
					404,
				);
			const message = await appendCustomerMessage({
				conversationId: conversation.id,
				sender: "customer",
				body: parsed.data.body,
			});
			await announceCustomerMessage(
				c,
				c.get("customer").workspaceId,
				conversation,
			);
			return respond(c, message, 201);
		},
	);

	app.post(
		"/v1/customer/messages/:id/read",
		customerRead,
		writeLimit,
		async (c) => {
			const customer = c.get("customer").customer;
			if (!customer)
				return respondError(c, "AUTHENTICATION_REQUIRED", "Sign in.", 401);
			const conversation = await getCustomerConversation(
				customer.workspaceCustomerId,
				c.req.param("id"),
			);
			if (!conversation)
				return respondError(
					c,
					"NOT_FOUND",
					"The conversation was not found.",
					404,
				);
			await markConversationRead({
				conversationId: conversation.id,
				reader: "customer",
			});
			return respond(c, { read: true });
		},
	);
}
