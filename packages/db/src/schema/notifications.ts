import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
		title: text("title").notNull(),
		body: text("body"),
		href: text("href"),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// The inbox query: a user's notifications, newest first.
		index("notifications_user_idx").on(table.userId, table.createdAt),
	],
);
