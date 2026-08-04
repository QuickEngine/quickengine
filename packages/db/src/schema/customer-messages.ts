import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { workspaceCustomers } from "./customers";
import { quickengineUsers, quickengineWorkspaces } from "./quickengine";

/** One customer-visible thread inside exactly one workspace membership. */
export const customerConversations = pgTable(
	"customer_conversations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		workspaceCustomerId: uuid("workspace_customer_id")
			.notNull()
			.references(() => workspaceCustomers.id, { onDelete: "cascade" }),
		// Stable per customer. `general` is customer support; lifecycle topics use
		// `order:<id>`, `invoice:<id>`, etc. This makes outbox replay idempotent.
		topicKey: text("topic_key").notNull().default("general"),
		subject: text("subject").notNull(),
		status: text("status").notNull().default("open"),
		lastMessageAt: timestamp("last_message_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("customer_conversations_customer_topic_key").on(
			table.workspaceCustomerId,
			table.topicKey,
		),
		index("customer_conversations_workspace_recent_idx").on(
			table.workspaceId,
			table.lastMessageAt,
		),
		index("customer_conversations_customer_recent_idx").on(
			table.workspaceCustomerId,
			table.lastMessageAt,
		),
	],
);

/** A durable message. Sender and read markers make unread state unambiguous. */
export const customerMessages = pgTable(
	"customer_messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => customerConversations.id, { onDelete: "cascade" }),
		sender: text("sender").notNull(), // customer | operator | system
		operatorUserId: text("operator_user_id").references(
			() => quickengineUsers.id,
			{ onDelete: "set null" },
		),
		body: text("body").notNull(),
		// Outbox events are at-least-once. A unique event key prevents duplicate
		// lifecycle messages without weakening ordinary compose/reply behavior.
		dedupeKey: text("dedupe_key").unique(),
		readByCustomerAt: timestamp("read_by_customer_at", { withTimezone: true }),
		readByOperatorAt: timestamp("read_by_operator_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("customer_messages_conversation_idx").on(
			table.conversationId,
			table.createdAt,
		),
	],
);
