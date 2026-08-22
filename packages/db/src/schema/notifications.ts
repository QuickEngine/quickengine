import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import {
	quickengineOrganizations,
	quickengineUsers,
	quickengineWorkspaces,
} from "./quickengine";

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

		/**
		 * Which workspace this is about.
		 *
		 * 🔴 The workspace used to exist only inside `href`, as text. So a person
		 * running several businesses saw one undifferentiated bell, and nothing
		 * could filter it — the information was in the row but only a human
		 * reading a URL could use it.
		 */
		workspaceId: uuid("workspace_id").references(
			() => quickengineWorkspaces.id,
			{ onDelete: "cascade" },
		),

		/**
		 * Whether this happened with real money.
		 *
		 * 🔴 A sandbox order and a live order produced IDENTICAL notifications —
		 * same title, same wording, same bell. "New order" meaning a real customer
		 * paid and "New order" meaning somebody pressed a test card are not the
		 * same news, and confusing them in either direction is bad: acting on a
		 * test as though it were real, or ignoring a real one as though it were a
		 * test.
		 *
		 * Nullable for rows written before this existed, which belong to no
		 * environment anybody can now determine.
		 */
		environment: text("environment", { enum: ["test", "live"] }),
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
		/**
		 * The record this is about, when it is about one.
		 *
		 * 🔑 `href` says which PAGE to open; this says which ROW on it. Without
		 * it a list can only be told "something here needs you" and not which
		 * line — so the dot on a row could never come from the bell, and the two
		 * would drift into disagreeing about the same fact.
		 *
		 * Null for anything not about a single record (a plan change, a digest).
		 */
		recordId: text("record_id"),
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
