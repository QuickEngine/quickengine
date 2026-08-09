# @quickengine/quick

The TypeScript developer surface for building custom storefronts, sites, apps, and
trusted servers on top of a QuickDash workspace. One business backend, many frontends.

> It only exposes endpoints that actually exist on the QuickDash API, with no speculative
> methods. **QuickConnect** is the browser-safe bridge from a custom frontend to its
> workspace; trusted server integrations use the same client with a server credential.

## Install

```sh
pnpm add @quickengine/quick
npm  install @quickengine/quick
yarn add @quickengine/quick
bun  add @quickengine/quick
```

Two entry points, and the split matters:

- `@quickengine/quick/browser` — anything that runs in a browser bundle.
- `@quickengine/quick` — servers and scripts. The root also carries webhook signature
  verification, which needs Node's `crypto` and must never enter a bundle.

## Content Security Policy

⚠️ **If your site sets a CSP, add the API to `connect-src` before anything else.** Without it
the browser refuses the request before dispatching it, and the failure arrives as a bare
`TypeError: Failed to fetch` — indistinguishable from the API being down, which sends people
debugging the wrong system.

```
connect-src 'self' https://api.quickdash.xyz;
```

If you serve media uploaded to QuickDash, add the same origin to `img-src`.

## Quick start — a site that doesn't sell

A portfolio, an agency site, a brochure site. Its workspace runs the words on its pages, and
the site reads them. Choose **"A website that doesn't sell"** on the Connect page; you get a
publishable key that can read content and record a page view, and can do nothing else.

```ts
import { createQuickConnect } from "@quickengine/quick/browser";

const quick = createQuickConnect({
  baseUrl: process.env.NEXT_PUBLIC_QUICKDASH_API_URL!,
  workspaceId: process.env.NEXT_PUBLIC_QUICKDASH_WORKSPACE_ID!,
  credential: { type: "site", key: process.env.NEXT_PUBLIC_QUICKDASH_SITE_KEY! },
});

// Every published slot, as a flat map: content["about.body"]
const { data } = await quick.site.content();
```

Two things worth doing from the start:

**Read content on the server, and keep a local fallback.** A server request sends no `Origin`,
so the key's allow-list never applies and your content renders on preview deployments whose
URLs were never registered. Falling back to a local default means the site is correct before it
is connected, and stale rather than blank if the API is unreachable.

**A contact form needs a server key.** Creating a client record requires `clients:write`, which
browser keys never carry. Post the form to your own route handler and call
`createQuickServer` there with a scoped key.

```ts
// app/api/contact/route.ts — server only, never a NEXT_PUBLIC_ variable
import { createQuickServer } from "@quickengine/quick";

const quick = createQuickServer({
  baseUrl: process.env.QUICKDASH_API_URL!,
  workspaceId: process.env.QUICKDASH_WORKSPACE_ID!,
  credential: { type: "scoped", token: process.env.QUICKDASH_API_KEY! },
});

await quick.clients.create({ name, email, notes: message }, crypto.randomUUID());
```

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

## Compatibility and deprecation

Quick.js follows Semantic Versioning independently from the continuously deployed product. While
the package is below 1.0, a breaking TypeScript surface change increments the minor version and is
called out with migration instructions. Patch releases remain compatible bug and security fixes.

The client targets the versioned `/v1` HTTP contract. A deprecation is documented in the public
changelog and package types before removal and remains through at least the next minor release,
unless retaining it would preserve an active security vulnerability. The latest published minor is
the supported pre-1.0 line; older versions remain usable against `/v1` on a best-effort basis.

## Security

Never place a `qsk_` or `qsc_` credential in browser or mobile code. Use the browser entry point
with a publishable/site key, keep customer data out of URLs and logs, and include the API request
ID when reporting a problem.

Report suspected vulnerabilities privately according to the repository
[security policy](https://github.com/QuickEngine/quickengine/security/policy). Do not open a public
issue containing an exploit, credential or customer data.

## Releases

Every package release requires green repository checks, SDK tests, both module formats and type
declarations, a dry-run inspection of the npm tarball, customer-readable release notes and a
post-publish install/import check. Package versions are prepared through Release Please; npm
publication remains an explicit maintainer action rather than an automatic side effect of a merge.
