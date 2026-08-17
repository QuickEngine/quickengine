import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineOrganizations, quickengineUsers } from "./quickengine";

// A user's notification inbox — user-scoped, cross-workspace. One row per thing a
// user should know about (a teammate joined, later: an assignment, a payment, a
// security event). Email delivery is a separate concern; this table is the durable
// in-app record. `organizationId` is optional context (account-level notifications
// have none); a deep-link `href` takes the user to the relevant place.
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(
			() => quickengineOrganizations.id,
			{ onDelete: "cascade" },
		),
		// Stable machine key, e.g. "org.member_joined" — lets the UI group/icon and
		// future preferences filter by type.
		type: text("type").notNull(),
		/**
		 * How loudly to say it. Three, deliberately.
		 *
		 * 🔑 Carried on the ROW rather than derived from `type` in each app. Two
		 * consoles read this inbox, and a mapping table in both of them means a new
		 * notification type renders as the wrong colour — or as nothing — until
		 * every frontend ships again. The producer knows the severity; it should
		 * be the thing that states it.
		 *
		 * `news` something happened that you would like to know (a sale, a message).
		 * `attention` something needs a decision soon, but nothing is broken.
		 * `failure` something went wrong and money or a customer is affected.
		 */
		signal: text("signal", { enum: ["news", "attention", "failure"] })
			.notNull()
			.default("news"),
		title: text("title").notNull(),
		body: text("body"),
		href: text("href"),
		/**
		 * What produced this, so the same fact cannot arrive twice.
		 *
		 * 🔴 The outbox delivers AT LEAST ONCE. Without this, a redelivered
		 * `order.paid` writes a second "New order" and the bell starts lying about
		 * how much has happened — which is the fastest way to make people stop
		 * reading it. Unique per user, so two people can each be told once.
		 *
		 * Null for notifications written directly rather than from an event; those
		 * have no redelivery to guard against.
		 */
		sourceKey: text("source_key"),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// The inbox query: a user's notifications, newest first.
		index("notifications_user_idx").on(table.userId, table.createdAt),
		// One notification per person per source event. The uniqueness is what
		// makes the handler safe to re-run, so redelivery is a no-op rather than a
		// duplicate.
		unique("notifications_user_source_key").on(table.userId, table.sourceKey),
	],
);
