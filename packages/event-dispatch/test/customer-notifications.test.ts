import { db } from "@quickengine/db";
import { orders } from "@quickengine/db/schema";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { customerNotificationHandler } from "../src/customer-notifications";

/**
 * Transactional mail to a workspace's own customers.
 *
 * DB_RULES rule 5: this runs the real handler against real rows. Rule 2: every
 * uuid here is hexadecimal — `l`, `s` and `m` are not hex digits and Postgres
 * rejects them with an error that reads like a code bug.
 */

const WORKSPACE = "aaaaaaaa-0000-4000-8000-0000000000fa";
const CLIENT = "bbbbbbbb-0000-4000-8000-0000000000fb";
const ORDER_WITH_CLIENT = "cccccccc-0000-4000-8000-0000000000fc";
const ORDER_GUEST = "dddddddd-0000-4000-8000-0000000000fd";
const ORDER_ANONYMOUS = "eeeeeeee-0000-4000-8000-0000000000fe";

type Sent = { to: string; subject: string; html: string; text: string };

function handlerCapturing(sent: Sent[]) {
	return customerNotificationHandler(
		async (input) => {
			sent.push(input);
			return { id: "test", provider: "test" };
		},
		() => {
			/* silence expected failures */
		},
	);
}

const event = (aggregateId: string, eventName = "order.created") => ({
	id: `evt-${aggregateId}`,
	workspaceId: WORKSPACE,
	aggregateType: "order",
	aggregateId,
	eventName,
	version: 1,
	payload: {},
	requestId: "req-1",
	actorId: null,
	actorType: null,
	occurredAt: new Date(),
	attempts: 1,
});

beforeEach(async () => {
	// A workspace needs a real owner: `owner_id` is a foreign key into
	// `quickengine_users`, and inventing a string fails on the constraint rather
	// than on anything to do with this handler.
	//
	// DB_RULES rule 3: every NOT NULL column is supplied here.
	//
	// ⚠️ NO `onConflictDoNothing` on these fixtures. The suite truncates before
	// every test, so a conflict cannot legitimately happen — and swallowing one
	// means a fixture that failed to insert produces a baffling failure three
	// assertions later instead of an obvious one at the insert. That is exactly
	// how this file first appeared flaky.
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values ('owner-notify', 'Notify Owner', 'notify@example.test', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${WORKSPACE}, 'owner-notify', 'Reese''s Gems & Co <Ltd>', 'commerce')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${CLIENT}, ${WORKSPACE}, 'Ash', 'linked@example.test')
	`;

	const base = {
		workspaceId: WORKSPACE,
		clientName: "Ash",
		status: "placed" as const,
		currency: "CAD",
		subtotalCents: 10_398,
		totalCents: 10_398,
	};

	await db.insert(orders).values([
		// Snapshot AND link — the snapshot should win.
		{
			...base,
			id: ORDER_WITH_CLIENT,
			sequence: 9001,
			number: "GEM-9001",
			clientId: CLIENT,
			clientEmail: "snapshot@example.test",
		},
		// A guest purchase: no client record at all, address on the order.
		{
			...base,
			id: ORDER_GUEST,
			sequence: 9002,
			number: "GEM-9002",
			clientId: null,
			clientEmail: "guest@example.test",
		},
		// Neither. Nobody to write to.
		{
			...base,
			id: ORDER_ANONYMOUS,
			sequence: 9003,
			number: "GEM-9003",
			clientId: null,
			clientEmail: null,
		},
	]);
});

describe("customer notifications", () => {
	it("sends an order confirmation branded as the WORKSPACE", async () => {
		const sent: Sent[] = [];
		await handlerCapturing(sent).handle(event(ORDER_WITH_CLIENT));

		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toContain("GEM-9001");
		// The business's name, escaped — not ours.
		expect(sent[0].html).toContain("Reese&#39;s Gems &amp; Co &lt;Ltd&gt;");
		expect(sent[0].html.toLowerCase()).not.toContain("quickengine");
		// Minor units must be formatted, never printed raw. 10398 would be a
		// $10,398 receipt for a $103.98 order.
		expect(sent[0].text).toContain("103.98");
		expect(sent[0].text).not.toContain("10398");
	});

	it("prefers the address ON the order over the linked client record", async () => {
		const sent: Sent[] = [];
		await handlerCapturing(sent).handle(event(ORDER_WITH_CLIENT));
		// The snapshot is what the buyer actually typed at checkout.
		expect(sent[0].to).toBe("snapshot@example.test");
	});

	it("🔴 emails a GUEST order, which has no client record at all", async () => {
		// The case the original leak was worst for: buy without an account, get
		// nothing. A guest has no `clientId`, so a client-record lookup alone
		// would send them silence.
		const sent: Sent[] = [];
		await handlerCapturing(sent).handle(event(ORDER_GUEST));
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe("guest@example.test");
	});

	it("sends nothing when there is no address anywhere", async () => {
		const sent: Sent[] = [];
		await handlerCapturing(sent).handle(event(ORDER_ANONYMOUS));
		expect(sent).toHaveLength(0);
	});

	it("ignores events it has no template for", async () => {
		const sent: Sent[] = [];
		await handlerCapturing(sent).handle(
			event(ORDER_WITH_CLIENT, "order.updated"),
		);
		// Every mutation raises an event. Sending on all of them would mail a
		// customer each time an operator edited a note.
		expect(sent).toHaveLength(0);
	});

	it("🔴 swallows a send failure instead of failing the outbox event", async () => {
		// A throw here would fail the whole event and stall the activity feed,
		// realtime and webhooks behind a mail provider.
		const handler = customerNotificationHandler(
			async () => {
				throw new Error("provider down");
			},
			() => {},
		);
		await expect(
			handler.handle(event(ORDER_WITH_CLIENT)),
		).resolves.toBeUndefined();
	});
});
