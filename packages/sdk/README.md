# @quickengine/quick

The TypeScript developer surface for building custom storefronts, sites, apps, and
trusted servers on top of a QuickDash workspace. One business backend, many frontends.

> **Status:** unpublished, evolving. It only exposes endpoints that actually exist on the
> QuickDash API, with no speculative methods. QuickConnect is the browser-safe bridge from a
> custom frontend to its workspace; trusted operator integrations use the same client with a
> server credential.

## Install

Inside this monorepo it's a workspace package:

```jsonc
// package.json
{ "dependencies": { "@quickengine/quick": "workspace:*" } }
```

(A public `npm` release comes only after the contract has compatibility and release
policies — see the build sequence in `internal/product/QUICK_JS.md`.)

## Quick start — connect any custom frontend

A custom website or app authenticates with a browser-safe site key scoped to one workspace.
The frontend controls its framework, routes, components, state and hosting; QuickConnect owns
the typed boundary to QuickDash.

```ts
import { createQuickConnect } from "@quickengine/quick/browser";

const quick = createQuickConnect({
  baseUrl: "https://api.quickdash.xyz",
  workspaceId: "00000000-0000-4000-8000-000000000000", // your workspace id
  credential: { type: "site", key: import.meta.env.VITE_QUICK_SITE_KEY },
});

// Render these however your framework and design system choose.
const { data: items } = await quick.catalog.list();
const { data: product } = await quick.catalog.get(items[0].id);

// Passwordless customer identity may return to this registered storefront origin.
await quick.customer.requestSignInLink(
  "customer@example.com",
  `${window.location.origin}/auth/verify`,
);

// On /auth/verify, exchange the one-time token and rebuild the client with
// credential: { type: "site", key, customerSession: data.token }.
const { data: session } = await quick.customer.verifySignInLink(tokenFromUrl);

// QuickDash calculates catalog prices, discounts, shipping and payment itself.
const { data: checkout } = await quick.site.checkout(
  {
    email: "customer@example.com",
    items: [{ catalogItemId: product.id, quantity: 1 }],
  },
  crypto.randomUUID(),
);
```

Every response is `{ data, requestId }`. `requestId` correlates the call with QuickDash's
logs — include it when reporting a problem.

## Credentials

The factory you use constrains, at compile time, which credential category you can pass —
but the server is always the real security boundary.

| Factory | Credential | Use it for |
|---|---|---|
| `createQuickConnect` | `{ type: "site", key, customerSession? }` | Any custom website or app: public catalog, checkout and one customer's private records. |
| `createQuickBrowser` | `{ type: "publishable", key }` | Public websites. Read-only, workspace-scoped, safe to ship in browser JS. |
| `createQuickBrowser` | `{ type: "session" }` | Requests made as a signed-in QuickEngine/QuickDash user (cookies included). |
| `createQuickServer` | `{ type: "secret", token }` | Trusted servers. **Never** ship in browser/mobile/public code, logs, or repos. |
| `createQuickServer` | `{ type: "scoped", token }` | A least-privilege server credential for one integration. |

A site or publishable key is **website-safe**: it can read, and it can send privacy-minimal
telemetry (traffic events a site reports about itself), but the server clamps it so it can
never carry operator or administrative authority. Checkout accepts item identifiers and
quantities; QuickDash calculates every amount and chooses the workspace's connected provider.

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

## QuickConnect today

- Catalog, categories, collections and workspace-managed site content.
- Authoritative item and variant availability, including tracked stock and backorders.
- Discount previews and server-priced shipping quotes.
- Idempotent checkout with provider-specific next actions and capture.
- Customer passwordless sign-in and sign-out.
- The signed-in customer's orders, payment summary, shipment tracking, bookings and invoices.
- Wishlists, reviews and referrals.
- Private customer conversations with the business.
- Privacy-minimal site telemetry.

QuickConnect is not a generated storefront and imposes no frontend structure. A React shop, a
Svelte booking site, an Astro marketing site, a native shell or plain JavaScript can all map
their own interface to the same workspace contract. Non-TypeScript clients may call the
documented REST API directly.
