# @quickengine/quick

The TypeScript developer surface for building custom storefronts, sites, apps, and
trusted servers on top of a QuickDash workspace. One business backend, many frontends.

> **Status:** unpublished, evolving. It only exposes endpoints that actually exist on the
> QuickDash API — no speculative methods. Today that means **reading a workspace's published
> catalog**. More resources land as their routes ship (see `internal/product/QUICK_JS.md`).

## Install

Inside this monorepo it's a workspace package:

```jsonc
// package.json
{ "dependencies": { "@quickengine/quick": "workspace:*" } }
```

(A public `npm` release comes only after the contract has compatibility and release
policies — see the build sequence in `internal/product/QUICK_JS.md`.)

## Quick start — a storefront reading its catalog

A public website has no logged-in QuickEngine user, so it authenticates with a
**publishable key** (safe to ship in browser code — it's read-only and scoped to one
workspace). Create one in **Account → your workspace → API keys**.

```ts
import { createQuickBrowser } from "@quickengine/quick";

const quick = createQuickBrowser({
  // Your QuickDash API origin, ending in /api. The SDK appends /v1/…
  baseUrl: "https://dash.quickengine.xyz/api",
  workspaceId: "00000000-0000-4000-8000-000000000000", // your workspace id
  credential: { type: "publishable", key: process.env.QUICKENGINE_PUBLISHABLE_KEY! },
});

// Product listing page: every active catalog item.
const { data: items } = await quick.catalog.list();

// Product detail page: one active item with its active variants.
const { data: product } = await quick.catalog.get(items[0].id);
```

Every response is `{ data, requestId }`. `requestId` correlates the call with QuickDash's
logs — include it when reporting a problem.

## Credentials

The factory you use constrains, at compile time, which credential category you can pass —
but the server is always the real security boundary.

| Factory | Credential | Use it for |
|---|---|---|
| `createQuickBrowser` | `{ type: "publishable", key }` | Public websites. Read-only, workspace-scoped, safe to ship in browser JS. |
| `createQuickBrowser` | `{ type: "session" }` | Requests made as a signed-in QuickEngine/QuickDash user (cookies included). |
| `createQuickServer` | `{ type: "secret", token }` | Trusted servers. **Never** ship in browser/mobile/public code, logs, or repos. |
| `createQuickServer` | `{ type: "scoped", token }` | A least-privilege server credential for one integration. |

A publishable key is **website-safe**: it can read, and it can send privacy-minimal
telemetry (traffic events a site reports about itself), but the server clamps it so it can
never carry a business-data write or admin capability — no orders, records, or money.

## Errors

A non-2xx response rejects with a `QuickApiError` carrying a stable `code`, the HTTP
`status`, the `requestId`, and optional `details`:

```ts
import { QuickApiError } from "@quickengine/quick";

try {
  await quick.catalog.get("does-not-exist");
} catch (error) {
  if (error instanceof QuickApiError) {
    // error.code === "not_found", error.status === 404
    console.error(error.code, error.requestId);
  }
}
```

Common codes: `unauthorized` (bad/expired/revoked key), `workspace_mismatch` (key isn't
scoped to that workspace), `capability_denied` (key lacks the needed capability),
`module_disabled` (the workspace hasn't enabled that module), `not_found`.

## Recording site telemetry

A site can report its own page views with the same publishable key — the server hashes
visitor/session ids and is idempotent on `eventId`:

```ts
await quick.events.record({
  eventId: crypto.randomUUID(),        // idempotency key
  siteKey: "gemsutopia",
  visitorId,                           // a stable opaque id — never PII
  sessionId,
  path: "/products/aurora",            // no query string
  occurredAt: new Date(),
});
```

## What exists today

- `quick.catalog.list()` → active catalog items.
- `quick.catalog.get(id)` → one active item with its active variants.
- `quick.events.record({ … })` → record one privacy-minimal traffic event (publishable-safe).

That's the honest surface. Orders and other resources arrive with their routes.
