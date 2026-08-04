import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "./client";
import {
	clientRecords,
	customerConversations,
	customerIdentities,
	customerMessages,
	workspaceCustomers,
} from "./schema";

export type CustomerMessageSender = "customer" | "operator" | "system";

const selection = {
	id: customerConversations.id,
	workspaceId: customerConversations.workspaceId,
	workspaceCustomerId: customerConversations.workspaceCustomerId,
	topicKey: customerConversations.topicKey,
	subject: customerConversations.subject,
	status: customerConversations.status,
	lastMessageAt: customerConversations.lastMessageAt,
	createdAt: customerConversations.createdAt,
	updatedAt: customerConversations.updatedAt,
	clientRecordId: workspaceCustomers.clientRecordId,
	clientName: clientRecords.name,
	customerEmail: customerIdentities.email,
};

function conversationQuery() {
	return db
		.select(selection)
		.from(customerConversations)
		.innerJoin(
			workspaceCustomers,
			eq(customerConversations.workspaceCustomerId, workspaceCustomers.id),
		)
		.innerJoin(
			customerIdentities,
			eq(workspaceCustomers.identityId, customerIdentities.id),
		)
		.leftJoin(
			clientRecords,
			eq(workspaceCustomers.clientRecordId, clientRecords.id),
		);
}

export const listOperatorConversations = (workspaceId: string) =>
	conversationQuery()
		.where(eq(customerConversations.workspaceId, workspaceId))
		.orderBy(desc(customerConversations.lastMessageAt));

export const listCustomerConversations = (workspaceCustomerId: string) =>
	conversationQuery()
		.where(eq(customerConversations.workspaceCustomerId, workspaceCustomerId))
		.orderBy(desc(customerConversations.lastMessageAt));

export async function getOperatorConversation(workspaceId: string, id: string) {
	const [row] = await conversationQuery()
		.where(
			and(
				eq(customerConversations.id, id),
				eq(customerConversations.workspaceId, workspaceId),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function getCustomerConversation(
	workspaceCustomerId: string,
	id: string,
) {
	const [row] = await conversationQuery()
		.where(
			and(
				eq(customerConversations.id, id),
				eq(customerConversations.workspaceCustomerId, workspaceCustomerId),
			),
		)
		.limit(1);
	return row ?? null;
}

export const listConversationMessages = (conversationId: string) =>
	db
		.select()
		.from(customerMessages)
		.where(eq(customerMessages.conversationId, conversationId))
		.orderBy(asc(customerMessages.createdAt), asc(customerMessages.id));

async function ensureConversation(input: {
	workspaceId: string;
	workspaceCustomerId: string;
	topicKey: string;
	subject: string;
}) {
	const [row] = await db
		.insert(customerConversations)
		.values(input)
		.onConflictDoUpdate({
			target: [
				customerConversations.workspaceCustomerId,
				customerConversations.topicKey,
			],
			set: { updatedAt: new Date() },
		})
		.returning();
	if (!row) throw new Error("CUSTOMER_CONVERSATION_CREATE_FAILED");
	return row;
}

export async function findWorkspaceCustomer(input: {
	workspaceId: string;
	workspaceCustomerId?: string;
	clientRecordId?: string;
}) {
	const member = input.workspaceCustomerId
		? eq(workspaceCustomers.id, input.workspaceCustomerId)
		: input.clientRecordId
			? eq(workspaceCustomers.clientRecordId, input.clientRecordId)
			: undefined;
	if (!member) return null;
	const [row] = await db
		.select({ id: workspaceCustomers.id })
		.from(workspaceCustomers)
		.where(and(eq(workspaceCustomers.workspaceId, input.workspaceId), member))
		.limit(1);
	return row ?? null;
}

export async function appendCustomerMessage(input: {
	conversationId: string;
	sender: CustomerMessageSender;
	body: string;
	operatorUserId?: string | null;
	dedupeKey?: string;
}) {
	const now = new Date();
	const [message] = await db
		.insert(customerMessages)
		.values({
			conversationId: input.conversationId,
			sender: input.sender,
			operatorUserId: input.operatorUserId ?? null,
			body: input.body,
			dedupeKey: input.dedupeKey,
			readByCustomerAt: input.sender === "customer" ? now : null,
			readByOperatorAt: input.sender !== "customer" ? now : null,
		})
		.onConflictDoNothing({ target: customerMessages.dedupeKey })
		.returning();
	if (message)
		await db
			.update(customerConversations)
			.set({ lastMessageAt: now, updatedAt: now, status: "open" })
			.where(eq(customerConversations.id, input.conversationId));
	return message ?? null;
}

export async function createCustomerConversation(input: {
	workspaceId: string;
	workspaceCustomerId: string;
	subject: string;
	body: string;
}) {
	const conversation = await ensureConversation({
		...input,
		topicKey: "general",
	});
	await appendCustomerMessage({
		conversationId: conversation.id,
		sender: "customer",
		body: input.body,
	});
	return conversation;
}

export async function createOperatorConversation(input: {
	workspaceId: string;
	workspaceCustomerId?: string;
	clientRecordId?: string;
	operatorUserId: string | null;
	subject: string;
	body: string;
}) {
	const membership = await findWorkspaceCustomer(input);
	if (!membership) return null;
	const conversation = await ensureConversation({
		workspaceId: input.workspaceId,
		workspaceCustomerId: membership.id,
		topicKey: "general",
		subject: input.subject,
	});
	await appendCustomerMessage({
		conversationId: conversation.id,
		sender: "operator",
		operatorUserId: input.operatorUserId,
		body: input.body,
	});
	return conversation;
}

export async function markConversationRead(input: {
	conversationId: string;
	reader: "customer" | "operator";
}) {
	const now = new Date();
	await db
		.update(customerMessages)
		.set(
			input.reader === "customer"
				? { readByCustomerAt: now }
				: { readByOperatorAt: now },
		)
		.where(
			and(
				eq(customerMessages.conversationId, input.conversationId),
				ne(customerMessages.sender, input.reader),
			),
		);
}

export async function setConversationStatus(input: {
	conversationId: string;
	status: "open" | "closed";
}) {
	const [row] = await db
		.update(customerConversations)
		.set({ status: input.status, updatedAt: new Date() })
		.where(eq(customerConversations.id, input.conversationId))
		.returning();
	return row ?? null;
}

export async function recordCustomerLifecycleMessage(input: {
	workspaceId: string;
	clientRecordId: string | null;
	topicKey: string;
	subject: string;
	body: string;
	eventId: string;
}) {
	if (!input.clientRecordId) return null;
	const membership = await findWorkspaceCustomer({
		workspaceId: input.workspaceId,
		clientRecordId: input.clientRecordId,
	});
	if (!membership) return null;
	const conversation = await ensureConversation({
		workspaceId: input.workspaceId,
		workspaceCustomerId: membership.id,
		topicKey: input.topicKey,
		subject: input.subject,
	});
	return appendCustomerMessage({
		conversationId: conversation.id,
		sender: "system",
		body: input.body,
		dedupeKey: `event:${input.eventId}`,
	});
}
