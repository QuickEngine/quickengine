import { Inngest } from "inngest";
import type { JobQueue } from "./index";

// The single QuickEngine Inngest app. The SDK reads INNGEST_EVENT_KEY and
// INNGEST_SIGNING_KEY from the environment automatically; we only pin the app id.
// Constructing the client is inert — it opens no connection — so it is safe even
// where no keys are configured (local dev / tests never call send()).
export const inngest = new Inngest({ id: "quickengine" });

// A minimal Inngest client surface, so the queue can be unit-tested against a fake
// without pulling in the SDK's full generics.
type EventSender = Pick<Inngest, "send">;

// Maps the provider-neutral enqueue onto an Inngest event send: the job name is the
// event name, the payload is the event data, and `idempotencyKey` becomes Inngest's
// event `id` (dedup within its retention window). `runAt` is intentionally not handled
// here — delayed execution is a function-level concern (`step.sleepUntil`), added when
// a scheduled job actually needs it; nothing on this path uses it yet.
export function createInngestJobQueue(client: EventSender = inngest): JobQueue {
	return {
		async enqueue(input) {
			await client.send({
				name: input.name,
				data: input.payload,
				...(input.idempotencyKey ? { id: input.idempotencyKey } : {}),
			});
			return {
				id: input.idempotencyKey ?? `inngest:${input.name}`,
				name: input.name,
			};
		},
	};
}

// Durable consumer of committed domain events (the event bus enqueues them as
// "event.dispatch"). Minimal for now: it acknowledges receipt so the pipeline is
// provably durable end to end. Later branches add steps that route each event to
// audit persistence, search indexing, and notifications.
export const eventDispatch = inngest.createFunction(
	{ id: "event-dispatch", retries: 3, triggers: [{ event: "event.dispatch" }] },
	async ({ event }) => {
		const eventId = (event.data as { eventId?: string } | undefined)?.eventId;
		return { received: eventId ?? null };
	},
);

// Every durable function the serve endpoint should register.
export const inngestFunctions = [eventDispatch];
