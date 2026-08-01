import { eventDispatchFunctions } from "@quickengine/event-dispatch";
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
}
