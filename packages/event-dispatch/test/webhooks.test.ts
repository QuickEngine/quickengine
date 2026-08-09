import {
	apiOutboxEvents,
	asc,
	db,
	eq,
	webhookDeliveries,
	webhookEndpoints,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import {
	encryptWebhookSecret,
	generateWebhookSecret,
	verifyWebhookSignature,
} from "@quickengine/events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	deliverPendingWebhooks,
	dispatchPendingEvents,
	endpointWantsEvent,
	webhookFanoutHandler,
} from "../src";

const ownerId = "webhook-owner";
const workspaceId = "00000000-0000-4000-8000-0000000b0001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000b0002";
const clientId = "00000000-0000-4000-8000-0000000b0003";

const secret = generateWebhookSecret();

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Webhook Owner', 'webhooks@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Webhook Workspace', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com')
	`;
});

async function endpoint(overrides: Record<string, unknown> = {}) {
	const [row] = await db
		.insert(webhookEndpoints)
		.values({
			workspaceId,
			url: "https://customer.example/hooks",
			secretCiphertext: encryptWebhookSecret(secret),
			eventTypes: [],
			...overrides,
		})
		.returning();
	return row;
}

async function pendingEvent(overrides: Record<string, unknown> = {}) {
	const [row] = await db
		.insert(apiOutboxEvents)
		.values({
			actorId: ownerId,
			actorType: "user",
			aggregateId: clientId,
			aggregateType: "client",
			eventName: "client.created",
			payload: { name: "Ada Lovelace" },
			requestId: crypto.randomUUID(),
			version: 1,
			workspaceId,
			...overrides,
		})
		.returning();
	return row;
}

const deliveries = () =>
	db.select().from(webhookDeliveries).orderBy(asc(webhookDeliveries.createdAt));

const publicResolver = async () => [
	{ address: "93.184.216.34", family: 4 as const },
];
const deliver = (options: Parameters<typeof deliverPendingWebhooks>[0] = {}) =>
	deliverPendingWebhooks({ resolver: publicResolver, ...options });

/** A fetcher that records calls and answers with a fixed status. */
const responder = (status = 200, body = "ok") => {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementation(async (url, init) => {
			calls.push({ url: String(url), init: init as RequestInit });
			return new Response(body, { status });
		});
	return { calls, fetcher };
};

describe("event subscription filter", () => {
	it("treats an empty filter as every event", () => {
		expect(endpointWantsEvent([], "invoice.paid")).toBe(true);
	});

	it("matches only the named events when a filter is set", () => {
		expect(endpointWantsEvent(["invoice.paid"], "invoice.paid")).toBe(true);
		expect(endpointWantsEvent(["invoice.paid"], "client.created")).toBe(false);
	});
});

describe("webhook fan-out", () => {
	it("queues one delivery per subscribed endpoint", async () => {
		const a = await endpoint();
		const b = await endpoint({ url: "https://second.example/hooks" });
		await pendingEvent();

		await dispatchPendingEvents({ handlers: [webhookFanoutHandler()] });

		const queued = await deliveries();
		expect(queued).toHaveLength(2);
		expect(new Set(queued.map((d) => d.endpointId))).toEqual(
			new Set([a.id, b.id]),
		);
		expect(queued[0]).toMatchObject({
			status: "pending",
			attempts: 0,
			eventName: "client.created",
		});
	});

	it("skips endpoints that did not subscribe to the event", async () => {
		await endpoint({ eventTypes: ["invoice.paid"] });
		await pendingEvent();

		await dispatchPendingEvents({ handlers: [webhookFanoutHandler()] });

		expect(await deliveries()).toHaveLength(0);
	});

	it("skips disabled endpoints", async () => {
		await endpoint({ enabled: false });
		await pendingEvent();

		await dispatchPendingEvents({ handlers: [webhookFanoutHandler()] });

		expect(await deliveries()).toHaveLength(0);
	});

	it("never sends another workspace's events to an endpoint", async () => {
		await endpoint();
		await pendingEvent({ workspaceId: otherWorkspaceId });

		await dispatchPendingEvents({ handlers: [webhookFanoutHandler()] });

		expect(await deliveries()).toHaveLength(0);
	});

	it("queues exactly one delivery even if the event is dispatched twice", async () => {
		const target = await endpoint();
		const event = await pendingEvent();

		// Outbox delivery is at-least-once, so fan-out must be idempotent or the
		// customer gets the same event twice.
		await webhookFanoutHandler().handle({
			id: event.id,
			workspaceId,
			aggregateType: "client",
			aggregateId: clientId,
			eventName: "client.created",
			version: 1,
			payload: {},
			requestId: event.requestId,
			actorId: ownerId,
			actorType: "user",
			occurredAt: event.occurredAt,
			attempts: 1,
		});
		await webhookFanoutHandler().handle({
			id: event.id,
			workspaceId,
			aggregateType: "client",
			aggregateId: clientId,
			eventName: "client.created",
			version: 1,
			payload: {},
			requestId: event.requestId,
			actorId: ownerId,
			actorType: "user",
			occurredAt: event.occurredAt,
			attempts: 2,
		});

		const queued = await deliveries();
		expect(queued).toHaveLength(1);
		expect(queued[0].endpointId).toBe(target.id);
	});
});

describe("webhook delivery", () => {
	const queueOne = async (overrides: Record<string, unknown> = {}) => {
		const target = await endpoint(overrides);
		await pendingEvent();
		await dispatchPendingEvents({ handlers: [webhookFanoutHandler()] });
		return target;
	};

	it("posts a signed payload and marks the delivery succeeded", async () => {
		await queueOne();
		const { calls, fetcher } = responder();

		const result = await deliver({ fetcher });

		expect(result).toMatchObject({ claimed: 1, succeeded: 1, retrying: 0 });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://customer.example/hooks");

		const headers = calls[0].init.headers as Record<string, string>;
		const body = calls[0].init.body as string;
		// The customer can verify the request came from us and was not modified.
		expect(
			verifyWebhookSignature({
				secret,
				body,
				header: headers["quickengine-signature"],
			}),
		).toBe(true);

		const payload = JSON.parse(body);
		expect(payload).toMatchObject({
			type: "client.created",
			workspaceId,
			data: { id: clientId, type: "client" },
		});
		// A stable id the consumer dedupes on, echoed in a header for convenience.
		expect(headers["quickengine-event-id"]).toBe(payload.id);

		const [stored] = await deliveries();
		expect(stored).toMatchObject({ status: "succeeded", responseStatus: 200 });
		expect(stored.deliveredAt).not.toBeNull();
	});

	it("retries a 500 with backoff rather than giving up", async () => {
		await queueOne();
		const { fetcher } = responder(500, "boom");

		const result = await deliver({ fetcher });

		expect(result).toMatchObject({ claimed: 1, succeeded: 0, retrying: 1 });
		const [stored] = await deliveries();
		expect(stored).toMatchObject({
			status: "pending",
			attempts: 1,
			responseStatus: 500,
			responseBody: "boom",
		});
		expect(stored.availableAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("records a transport failure with no HTTP status", async () => {
		await queueOne();
		const fetcher = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("connect ETIMEDOUT"));

		const result = await deliver({ fetcher });

		expect(result).toMatchObject({ retrying: 1 });
		const [stored] = await deliveries();
		expect(stored).toMatchObject({
			status: "pending",
			responseStatus: null,
			error: "connect ETIMEDOUT",
		});
	});

	it("never calls the endpoint when DNS resolves into a private network", async () => {
		await queueOne();
		const { calls, fetcher } = responder();

		const result = await deliverPendingWebhooks({
			fetcher,
			resolver: async () => [
				{ address: "169.254.169.254", family: 4 as const },
			],
		});

		expect(result).toMatchObject({ succeeded: 0, retrying: 1 });
		expect(calls).toHaveLength(0);
		const [stored] = await deliveries();
		expect(stored.error).toBe("WEBHOOK_URL_PRIVATE");
	});

	it("succeeds on a retry once the endpoint recovers", async () => {
		await queueOne();
		await deliver({ fetcher: responder(503).fetcher });

		const { fetcher } = responder(200);
		const result = await deliver({
			fetcher,
			// Pretend the backoff window has passed.
			now: () => new Date(Date.now() + 120_000),
		});

		expect(result).toMatchObject({ succeeded: 1 });
		const [stored] = await deliveries();
		expect(stored).toMatchObject({ status: "succeeded", attempts: 2 });
	});

	it("gives up after the attempt budget and stops retrying", async () => {
		await queueOne();
		const { fetcher } = responder(500);

		let clock = Date.now();
		for (let i = 0; i < 8; i += 1) {
			await deliver({
				fetcher,
				maxAttempts: 8,
				now: () => new Date(clock),
			});
			clock += 7_200_000; // Past any backoff.
		}

		const [stored] = await deliveries();
		expect(stored).toMatchObject({ status: "exhausted", attempts: 8 });

		// An exhausted delivery is never claimed again.
		const after = await deliver({ fetcher, maxAttempts: 8 });
		expect(after.claimed).toBe(0);
	});

	it("truncates an oversized response body instead of storing it whole", async () => {
		await queueOne();
		const { fetcher } = responder(400, "x".repeat(10_000));

		await deliver({ fetcher });

		const [stored] = await deliveries();
		expect(stored.responseBody).toHaveLength(2_000);
	});

	it("treats any non-2xx as a failure, including a redirect", async () => {
		await queueOne();
		const { fetcher } = responder(302, "moved");

		const result = await deliver({ fetcher });

		expect(result).toMatchObject({ succeeded: 0, retrying: 1 });
	});

	it("disables an endpoint that keeps exhausting deliveries", async () => {
		const target = await endpoint();
		const { fetcher } = responder(500);

		// Two events, both driven to exhaustion.
		for (let i = 0; i < 2; i += 1) {
			await pendingEvent({ aggregateId: `${clientId}` });
			await dispatchPendingEvents({ handlers: [webhookFanoutHandler()] });
		}
		let clock = Date.now();
		for (let i = 0; i < 3; i += 1) {
			await deliver({
				fetcher,
				maxAttempts: 2,
				disableAfterExhausted: 2,
				now: () => new Date(clock),
			});
			clock += 7_200_000;
		}

		const [stored] = await db
			.select()
			.from(webhookEndpoints)
			.where(eq(webhookEndpoints.id, target.id));
		expect(stored.enabled).toBe(false);
		expect(stored.disabledReason).toContain("consecutive failed deliveries");
	});

	it("does not claim a delivery another worker already leased", async () => {
		await queueOne();
		// First worker claims and is still in flight (its lease pushed availableAt out).
		await deliver({ fetcher: responder(500).fetcher });

		const { calls, fetcher } = responder(200);
		const result = await deliver({ fetcher });

		expect(result.claimed).toBe(0);
		expect(calls).toHaveLength(0);
	});
});
