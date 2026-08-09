# QuickEngine Software

**Build more. Switch less.**

A modular business operating system for freelancers, agencies, shops, service businesses and
growing teams. **QuickEngine** owns identity, accounts and billing. **QuickDash** is the
product: one deployment serving many isolated workspaces, each enabling only the modules that
business actually needs.

A workspace can be run through QuickDash directly, or driven entirely by your own frontend
through the public API and **QuickConnect**, the framework-independent browser surface in the
Quick.js SDK. New business types are assembled from reusable module recipes rather than forked
into separate applications.

---

## Surfaces

| Host | What it is |
|---|---|
| `quickengine.xyz` | The company. Marketing. No login. |
| `quickdash.xyz` | **The product.** |
| `account.quickdash.xyz` | Console — organizations, workspaces, team, billing, usage |
| `auth.quickdash.xyz` | Identity — signup, login, passkeys, TOTP, sessions |
| `api.quickdash.xyz` | The public API |
| `portal.quickdash.xyz` | **The customer portal — our users' users.** Their orders, bookings and invoices, and nothing else |
| `quickdash.statuspage.io` | **Status — live.** Incidents and uptime |
| `docs.` · `help.` | Documentation and support — planned |

**QuickDash Desktop** (macOS · Windows · Linux) is a Tauri shell around the deployed web
product, so a web release reaches the app without an update. **QuickDash Mobile** (iOS ·
Android) is planned from the same project.

---

## The 16 modules

Client Records · Products & Services · Quotes & Estimates · Invoicing · Payments · Orders ·
Fulfillment · Inventory · Shipping · Projects & Tasks · Time Tracking · Bookings ·
Contracts & E-sign · Files & Documents · Reporting & Analytics · Content

Each owns a manifest, a configuration contract, its own schema and a service boundary. Workspace
registry rows decide what QuickDash loads, and dependency resolution prevents broken
configurations — enabling Shipping brings Orders and its prerequisites with it.

Shipping supports deterministic country and region zones, flat and weight-based delivery,
order-value bands and free-shipping thresholds. Storefronts choose a quoted rate; QuickDash
re-prices catalog values, item weights and the selected rate before it records or charges the
order.

Payments supports multiple connected merchant processors per workspace. Stripe and PayPal can
remain connected together, one is selected as the checkout default, and each historical payment
retains its processor so settlement and refunds never depend on whichever provider is active
today.

---

## Two audiences, two surfaces

**Operators** run their business in QuickDash: a session or a secret key, every module they
enabled, everything in the workspace.

**Their customers** — a shopper, a client, a patient, a student — reach `/v1/customer/*` with a
publishable key and a session of their own. They see their own orders, bookings and invoices and
nothing else, and they are a separate kind of identity: no seat, no team membership, no route
into anybody's dashboard. One hosted portal serves every workspace, showing each business's name
and only the sections it runs — on its own domain if the business points one at us, so its
customers never see ours.

The two are separate namespaces with no foreign key between them, resolved by different
middleware from different headers. A customer session cannot satisfy an operator route.

---

## Architecture

**The API is the product boundary.** Every write goes through a Hono service that commits
domain state, idempotency, audit and the event outbox **in a single transaction** — so a
request either happened completely or not at all, and there is always a record of it.

- **Transactional outbox** with lease-based claiming (`FOR UPDATE SKIP LOCKED`), at-least-once
  delivery and preserved ordering
- **Two-stage webhooks** — fan-out to the database, then an HTTP worker — so one slow endpoint
  cannot delay another. HMAC-SHA256 signed, replayable.
- **Capability-based access control.** Code asks `can(role, capability)`, never
  `role === "admin"`, so organizations can define **custom roles by any name**.
- **Compile-time type proofs** that stop the OpenAPI document drifting from the implementation
- **A boundary ratchet** capping Next server actions and route handlers, which may only
  decrease — the mechanism that keeps logic in the API rather than in the frontend

**Metering charges only what costs real infrastructure** — storage, AI, email, API volume.
Never a business outcome the customer earns: no per-invoice fee, no per-customer fee, ever.
AI runs on prepaid credits with per-run and per-workspace ceilings, and **work already running
always finishes** — limits stop the next request, never the one in progress.

---

## Stack

TypeScript (strict) · **Hono** (the canonical API) · **Vite + TanStack Router/Query** ·
Tailwind + shadcn/ui · Drizzle + Postgres (Neon) · Better Auth · Redis · Stripe + PayPal ·
Resend · Cloudinary + Vercel Blob · Algolia · Sentry · Pusher · Inngest · **Biome** ·
pnpm + Turborepo · Vercel

```txt
apps/quickengine/{web,auth,account}   the frontends
apps/quickdash/web                    the operator's workspace
apps/quickdash/portal                 the customer portal — our users' users
services/api                          the canonical Hono boundary
packages/
  modules/          16 isolated business capabilities
  module-registry/  catalog, manifests, dependency resolver
  auth/ db/ ui/     shared foundations
  billing/          Stripe, plans, metering, credits
  events/           domain events and the outbox
  realtime/ jobs/ search/ cache/ storage/ email/   providers behind seams
  sdk/ cli/         Quick.js and the `quick` command
  agent-*/          bounded model-execution foundations
  integration-tests/ e2e-tests/
```

---

## Local development

```sh
pnpm install
pnpm docker:up          # Postgres :5435, Redis :6381
pnpm db:push
pnpm dev                # everything
```

Individually: `pnpm web` · `pnpm auth` · `pnpm account` · `pnpm dash` ·
`pnpm portal` · `pnpm api`

A customer portal is not reachable until it is published — `pnpm portal:enable [workspaceId]`
assigns its address and mints its publishable key.

```sh
pnpm check              # Biome + boundary ratchet + error-map check
pnpm typecheck
pnpm test
```

## Plans

| | Free | Launch | Grow | Scale | Expand | Custom |
|---|---|---|---|---|---|---|
| Price / mo | $0 | $30 | $90 | $240 | **$30 per seat** | conversation |
| Seats | 1 | 2 | 5 | 15 | 16 minimum | custom |
| Workspaces | 1 | 3 | 10 | 25 | unlimited | custom |
| Storage | 1 GB | 25 GB | 100 GB | 500 GB | 50 GB per seat | custom |
| API requests | 10k | 250k | 1M | 5M | 500k per seat | custom |
| AI actions | 25 | 500 | 2,500 | 10,000 | 1,500 per seat | custom |

Annual is ten months on every tier. **Expand bills per seat and starts at 16**, so its entry
price is $480/mo — the point at which a company has outgrown Scale's flat 15.

A hidden **Bypass** tier exists for internal use. It is never sold or listed: unlimited on
everything that costs only our own infrastructure, with AI still capped, because that allowance
is prepaid and shared across every customer.

Modules are free, paid-to-unlock-then-unlimited, or resource-metered. AI beyond the included
allowance draws on prepaid credits. Outbound webhook deliveries are counted but not capped.

---

## Status

The backend feature line is complete, and the isolated Gemsutopia proof now runs a whole sale
through QuickConnect against synthetic Docker data: catalog, availability, categories and
published content; passwordless sign-in that returns to the storefront; isolated wishlists,
moderated reviews and customer-owned referral codes; discount codes priced against the real
basket; delivery options; an order with authoritative totals that a repeated request cannot
duplicate; owned orders no other customer can read; a two-way message answered by the business;
and a single-use pass that opens the account portal without a second sign-in. The custom
storefront reads all of it without changing its visual system.
One leg is unproven locally — capturing a real PayPal sandbox payment needs credentials this
machine does not have — and is tracked as a pre-launch gate.

**The backend feature line is closed; a bounded pre-UI security pass is current.** Its first
slice prevents outbound webhooks from reaching private networks, clears the production npm
advisory set, continuously analyzes changes with CodeQL and pins CI dependencies immutably.
The remaining pass covers browser sessions and headers, sensitive files and provider tokens,
automated tenant-isolation attacks, operational response, and the published Quick.js contract.
Then the UI/UX pass resumes from Workspace
Connect: sign up, create a workspace, tell it where your site lives, paste three lines of
configuration, and the page confirms itself the moment your site makes its first request. A key
is locked to the addresses you name, so one copied out of your page source cannot be used to
build another website. Proven on a freshly created account against a real storefront.
The frontends run on Vite and TanStack; **Next.js is gone entirely**. Automation and workflow
orchestration stay deliberately out of the current delivery path — the goal is one complete,
truthful business workflow before the ecosystem widens.

Not open source. All rights reserved.
