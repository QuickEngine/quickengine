import { onMutationCommitted } from "@quickengine/db";
import {
	eventDispatchFunctions,
	OUTBOX_WRITTEN_EVENT,
} from "@quickengine/event-dispatch";
import { inngest, inngestFunctions } from "@quickengine/jobs";
import type { Hono } from "hono";
import { serve } from "inngest/hono";
import type { PlatformEnv } from "./platform-types";

/**
 * The Inngest callback endpoint.
 *
 * Inngest invokes this to run our durable functions — currently the outbox
 * dispatcher and the webhook sender. It is a transport shell: the functions
 * themselves live in `@quickengine/event-dispatch`, so this file registers them
 * and nothing more.
 *
 * **Deliberately outside the platform gate.** Every other route requires a
 * workspace credential; this one is authenticated by Inngest's own request
 * signing, verified by the SDK using `INNGEST_SIGNING_KEY`. Putting it behind
 * `authorizeWorkspace` would reject Inngest itself, since it has no session and
 * no API key, and its requests are not workspace-scoped — a single invocation
 * drains events across every workspace.
 *
 * It is also exempt from CSRF for the same reason: the middleware only challenges
 * cookie-authenticated writes, and Inngest sends none.
 */
export function registerInngestRoutes(app: Hono<PlatformEnv>) {
	const handler = serve({
		client: inngest,
		functions: [...inngestFunctions, ...eventDispatchFunctions],
		// Without this the SDK infers its own URL from request headers, which is
		// wrong behind Vercel's proxy — it would register a callback URL that
		// Inngest cannot reach.
		// 🔴 Reads BOTH. `.env.example` documents `INNGEST_SERVE_ORIGIN` and this
		// read `API_BASE_URL`, which appears in no example file — so a deployment
		// following the docs left this undefined and the SDK fell back to inferring
		// its callback URL from proxy headers, which the comment above says is
		// wrong behind Vercel. The documented name wins; the other is the fallback
		// so existing deployments keep working.
		serveOrigin: process.env.INNGEST_SERVE_ORIGIN || process.env.API_BASE_URL,
		servePath: "/api/inngest",
	});

	// GET returns app metadata (how Inngest discovers the functions), PUT triggers
	// a sync, POST executes a function step.
	app.on(["GET", "POST", "PUT"], "/api/inngest", (c) => handler(c));

	/**
	 * Drain the outbox as soon as a mutation commits.
	 *
	 * 🔴 The drain used to run ONLY on its every-minute cron, so a paid order
	 * waited up to a minute before its confirmation email, its purchase order or
	 * its supplier handoff began. Measured on real orders: 51s and 98s.
	 *
	 * ⚠️ Best effort, and it must stay that way. The mutation has already
	 * committed by the time this runs — failing here would turn a latency problem
	 * into a lost write. The cron still drains everything, so a send that fails,
	 * or never happens because this process died, costs nothing but time.
	 *
	 * Registered here because this file already holds the Inngest client; wiring
	 * it into `@quickengine/db` would drag a provider SDK into the module graph of
	 * every route (hard rule 12).
	 */
	onMutationCommitted(async () => {
		const sent = inngest.send({ name: OUTBOX_WRITTEN_EVENT }).catch(() => {
			// Swallowed: the cron is the backstop and the write is already durable.
		});
		// Handed to the platform where possible, so the response is not delayed.
		// Where it is not possible, WAIT — an unawaited promise on a serverless
		// host is discarded the moment the response returns, which is exactly how
		// the previous two attempts did nothing.
		if (!keepAlive(sent)) await sent;
	});
}

/**
 * Keep the serverless instance alive until a fire-and-forget promise settles.
 *
 * 🔴 `void inngest.send(...)` DOES NOT WORK on Vercel and looks like it does.
 * The handler returns its response, the platform freezes the instance, and the
 * outbound request is discarded mid-flight — silently, because nothing is
 * awaiting it. Measured on a real order 2026-08-29: `order.paid` still waited 25
 * seconds, and the logs showed no `/api/inngest` invocation between the commit
 * and the next cron tick. The nudge had never left the process.
 *
 * `waitUntil` is Vercel's own mechanism for exactly this; reading it off the
 * request-context global is what `@vercel/functions` does internally, and doing
 * it here avoids adding a dependency to the API for one function.
 *
 * ⚠️ Returns whether the host took it. When it did not — local dev, tests, any
 * other platform — the CALLER must await the promise instead. Dropping it there
 * is what made two previous attempts look correct and do nothing.
 */
export function keepAlive(promise: Promise<unknown>): boolean {
	try {
		const context = (
			globalThis as unknown as Record<
				symbol,
				| { get?: () => { waitUntil?: (p: Promise<unknown>) => void } }
				| undefined
			>
		)[Symbol.for("@vercel/request-context")];
		const hook = context?.get?.()?.waitUntil;
		if (hook) {
			hook(promise);
			return true;
		}
	} catch {
		// Any surprise in the host's internals leaves it to the caller.
	}
	return false;
}
