import {
	countUnreadNotifications,
	createNotification,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const userId = "notif-user";
const otherUserId = "notif-other";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values
			(${userId}, 'Notif User', 'notif@example.com', true),
			(${otherUserId}, 'Other User', 'other@example.com', true)
	`;
});

describe("notifications inbox", () => {
	it("creates, lists newest-first, and counts unread", async () => {
		await createNotification({
			userId,
			type: "org.member_joined",
			title: "First",
		});
		await createNotification({
			userId,
			type: "org.member_joined",
			title: "Second",
			body: "Ada accepted your invitation.",
			href: "/team",
		});

		const rows = await listNotifications(userId);
		expect(rows.map((r) => r.title)).toEqual(["Second", "First"]);
		expect(rows[0]).toMatchObject({
			body: "Ada accepted your invitation.",
			href: "/team",
		});
		expect(await countUnreadNotifications(userId)).toBe(2);
	});

	it("marks one read (owner-scoped) and filters unread-only", async () => {
		const first = await createNotification({ userId, type: "t", title: "One" });
		await createNotification({ userId, type: "t", title: "Two" });

		// A different user can't mark this user's notification read.
		await markNotificationRead(otherUserId, first.id);
		expect(await countUnreadNotifications(userId)).toBe(2);

		await markNotificationRead(userId, first.id);
		expect(await countUnreadNotifications(userId)).toBe(1);

		const unread = await listNotifications(userId, { unreadOnly: true });
		expect(unread.map((r) => r.title)).toEqual(["Two"]);
	});

	it("marks all read for the user and no one else", async () => {
		await createNotification({ userId, type: "t", title: "Mine 1" });
		await createNotification({ userId, type: "t", title: "Mine 2" });
		await createNotification({
			userId: otherUserId,
			type: "t",
			title: "Theirs",
		});

		await markAllNotificationsRead(userId);
		expect(await countUnreadNotifications(userId)).toBe(0);
		expect(await countUnreadNotifications(otherUserId)).toBe(1);
	});

	it("scopes the inbox to its user", async () => {
		await createNotification({ userId, type: "t", title: "Mine" });
		await createNotification({
			userId: otherUserId,
			type: "t",
			title: "Theirs",
		});

		const rows = await listNotifications(userId);
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe("Mine");
	});
});
