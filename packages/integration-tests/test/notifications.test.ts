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

		// `createNotification` returns null only when a `sourceKey` matched an
		// existing row. These carry none, so an insert always happens; narrowing
		// here rather than asserting keeps that reasoning visible.
		if (!first) throw new Error("Expected a notification row.");

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

/**
 * 🔴 Sandbox news and real news must never share a list.
 *
 * "New order" meaning a real customer paid and "New order" meaning somebody
 * pressed 4242 4242 4242 4242 are the same sentence. Mixing them means either
 * acting on a test or ignoring a sale, and both are how somebody stops
 * believing the bell.
 */
describe("notifications keep test and live apart", () => {
	beforeEach(async () => {
		await createNotification({
			userId,
			type: "order.paid",
			title: "Live order",
			environment: "live",
		});
		await createNotification({
			userId,
			type: "order.paid",
			title: "Test order",
			environment: "test",
		});
		// No environment: an invitation or a billing notice. Not commerce, no mode.
		await createNotification({
			userId,
			type: "org.member_joined",
			title: "Ada joined",
		});
	});

	it("shows a live workspace its own news and never the sandbox's", async () => {
		const rows = await listNotifications(userId, { environment: "live" });
		expect(rows.map((r) => r.title).sort()).toEqual([
			"Ada joined",
			"Live order",
		]);
	});

	it("shows a sandbox its own news and never the live one's", async () => {
		const rows = await listNotifications(userId, { environment: "test" });
		expect(rows.map((r) => r.title).sort()).toEqual([
			"Ada joined",
			"Test order",
		]);
	});

	it("counts unread per mode, so the badge cannot promise a sale that is a test", async () => {
		expect(
			await countUnreadNotifications(userId, { environment: "live" }),
		).toBe(2);
		expect(
			await countUnreadNotifications(userId, { environment: "test" }),
		).toBe(2);
	});

	/**
	 * The account app is not standing in a workspace, so it asks for everything.
	 * ⚠️ This is deliberate, not a leak: account is where you go to see that
	 * something happened at all, and hiding half of it there would be worse.
	 */
	it("returns every mode when no workspace is named", async () => {
		const rows = await listNotifications(userId);
		expect(rows).toHaveLength(3);
		expect(await countUnreadNotifications(userId)).toBe(3);
	});
});
