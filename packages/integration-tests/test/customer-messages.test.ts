import {
	appendCustomerMessage,
	createOperatorConversation,
	getCustomerConversation,
	getOperatorConversation,
	listConversationMessages,
	listCustomerConversations,
	listOperatorConversations,
	markConversationRead,
	recordCustomerLifecycleMessage,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const WORKSPACE_A = "aaaaaaaa-1000-4000-8000-000000000001";
const WORKSPACE_B = "bbbbbbbb-1000-4000-8000-000000000002";
const CLIENT_A = "aaaaaaaa-2000-4000-8000-000000000001";
const CLIENT_B = "bbbbbbbb-2000-4000-8000-000000000002";
const IDENTITY_A = "aaaaaaaa-3000-4000-8000-000000000001";
const IDENTITY_B = "bbbbbbbb-3000-4000-8000-000000000002";
const CUSTOMER_A = "aaaaaaaa-4000-4000-8000-000000000001";
const CUSTOMER_B = "bbbbbbbb-4000-4000-8000-000000000002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values ('message-owner', 'Owner', 'message-owner@example.test', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${WORKSPACE_A}, 'message-owner', 'Workspace A', 'commerce'), (${WORKSPACE_B}, 'message-owner', 'Workspace B', 'services')`;
	await sql`insert into client_records (id, workspace_id, name, email) values (${CLIENT_A}, ${WORKSPACE_A}, 'Customer A', 'a@example.test'), (${CLIENT_B}, ${WORKSPACE_B}, 'Customer B', 'b@example.test')`;
	await sql`insert into customer_identities (id, email, email_verified_at) values (${IDENTITY_A}, 'a@example.test', now()), (${IDENTITY_B}, 'b@example.test', now())`;
	await sql`insert into workspace_customers (id, workspace_id, identity_id, client_record_id) values (${CUSTOMER_A}, ${WORKSPACE_A}, ${IDENTITY_A}, ${CLIENT_A}), (${CUSTOMER_B}, ${WORKSPACE_B}, ${IDENTITY_B}, ${CLIENT_B})`;
});

describe("customer conversations", () => {
	it("lets an operator and customer reply in one durable thread", async () => {
		const conversation = await createOperatorConversation({
			workspaceId: WORKSPACE_A,
			clientRecordId: CLIENT_A,
			operatorUserId: "message-owner",
			subject: "Your order",
			body: "How can we help?",
		});
		if (!conversation) throw new Error("conversation fixture was not created");
		await appendCustomerMessage({
			conversationId: conversation.id,
			sender: "customer",
			body: "I have a question.",
		});

		const messages = await listConversationMessages(conversation.id);
		expect(messages.map((message) => message.sender)).toEqual([
			"operator",
			"customer",
		]);
		expect(
			(await listOperatorConversations(WORKSPACE_A))[0]?.customerEmail,
		).toBe("a@example.test");
		expect((await listCustomerConversations(CUSTOMER_A))[0]?.subject).toBe(
			"Your order",
		);
	});

	it("does not resolve a conversation across a workspace or customer boundary", async () => {
		const conversation = await createOperatorConversation({
			workspaceId: WORKSPACE_A,
			workspaceCustomerId: CUSTOMER_A,
			operatorUserId: "message-owner",
			subject: "Private",
			body: "Only A",
		});
		if (!conversation) throw new Error("conversation fixture was not created");
		expect(
			await getOperatorConversation(WORKSPACE_B, conversation.id),
		).toBeNull();
		expect(
			await getCustomerConversation(CUSTOMER_B, conversation.id),
		).toBeNull();
	});

	it("tracks read state for the receiving side", async () => {
		const conversation = await createOperatorConversation({
			workspaceId: WORKSPACE_A,
			workspaceCustomerId: CUSTOMER_A,
			operatorUserId: "message-owner",
			subject: "Read state",
			body: "Unread by customer",
		});
		if (!conversation) throw new Error("conversation fixture was not created");
		let [message] = await listConversationMessages(conversation.id);
		expect(message?.readByCustomerAt).toBeNull();
		await markConversationRead({
			conversationId: conversation.id,
			reader: "customer",
		});
		[message] = await listConversationMessages(conversation.id);
		expect(message?.readByCustomerAt).not.toBeNull();
	});

	it("records a lifecycle event once even when the outbox replays it", async () => {
		const input = {
			workspaceId: WORKSPACE_A,
			clientRecordId: CLIENT_A,
			topicKey: "order:abc",
			subject: "Order ABC",
			body: "Your order shipped.",
			eventId: "event-abc",
		};
		await recordCustomerLifecycleMessage(input);
		await recordCustomerLifecycleMessage(input);
		const [conversation] = await listCustomerConversations(CUSTOMER_A);
		if (!conversation)
			throw new Error("lifecycle conversation was not created");
		expect(await listConversationMessages(conversation.id)).toHaveLength(1);
	});
});
