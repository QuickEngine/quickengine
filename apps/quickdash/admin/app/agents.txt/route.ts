export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Machine-readable integration guide for AI coding agents building a frontend against
 * QuickDash. Served at /agents.txt so a user can point their agent at one URL instead of
 * pasting documentation.
 *
 * Rule for editing this file: document ONLY routes that exist. An agent cannot tell the
 * difference between a planned endpoint and a real one, and will confidently generate code
 * against whatever is written here.
 */
const body = () => {
	// Read directly rather than pulling @quickengine/env in as a dependency for one string.
	const base = process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL ?? "";
	return `# agents.txt — QuickDash API integration guide for AI coding agents

QuickDash is the business backend for this workspace. Your job is usually to build or wire
up a frontend that reads from it. Everything below is real and currently served.

## Base URL

${base || "https://dash.quickengine.net"}

## Authentication

Every request needs two headers:

  QuickEngine-Workspace: <workspace-uuid>
  QuickEngine-Publishable-Key: qpk_...   # browser-safe, read-only + telemetry

Key types:
  qpk_  publishable — safe in browser code. Read catalog, write traffic events. Nothing else.
  qsk_  secret      — server-side ONLY. Never ship in frontend code or commit it.
  qsc_  scoped      — server-side, narrowed capabilities.

If you are writing code that runs in a browser, you must use a qpk_ key. Putting a qsk_
key in frontend code exposes the workspace's data — do not do it, and warn the user if
they paste one.

Responses carry a Request-Id header. Include it when reporting a problem.

## Endpoints

GET /api/v1/catalog
  List active catalog items (products, services, packages, rentals) for the workspace.

GET /api/v1/catalog/:id
  One active item with its active variants. A non-active item reads as not_found.

POST /api/v1/events
  Record one privacy-minimal traffic event (a page view). Idempotent on a client-supplied
  eventId. Visitor and session ids are hashed server-side — never send raw personal data.
  Requires the events:write capability, which a publishable key may hold.

That is the entire public surface today. If you need something else — orders, invoices,
clients, payments — it is not exposed yet. Do not invent endpoints; ask the user.

## SDK (preferred over raw fetch)

  npm install @quickengine/quick

  import { createQuickBrowser } from "@quickengine/quick";

  const quick = createQuickBrowser({
    baseUrl: "${base || "https://dash.quickengine.net"}",
    workspace: process.env.NEXT_PUBLIC_QUICKENGINE_WORKSPACE,
    publishableKey: process.env.NEXT_PUBLIC_QUICKENGINE_PUBLISHABLE_KEY,
  });

  const items = await quick.catalog.list();
  const item  = await quick.catalog.get(id);
  await quick.events.record({ ... });

Errors throw QuickApiError, which carries the status and the Request-Id.

## Conventions worth following

- Money is integer cents plus a currency code. Never use floats.
- Ids are UUIDs.
- Read keys from environment variables; never hardcode them.
- The workspace id is stable — treat it as configuration, not user input.

## Getting keys

The workspace owner creates keys in QuickEngine Account under the workspace's API keys
section. A secret key is shown once. If the user has not created one yet, tell them to do
that rather than guessing at a value.
`;
};

export async function GET() {
	return new Response(body(), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
