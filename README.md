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

Inventory covers where stock comes from as well as how much is left: a business that does not
make what it sells records its suppliers, how orders are meant to reach them, and the code each
product carries in the supplier's own system. When an order is paid, QuickDash raises a purchase
order against whichever supplier actually makes each line, keeping the lines a business stocks
itself out of it, and hands it over the way that supplier is reached. A supplier's own system can be
connected and checked before anyone relies on it, so an unrecognised product code is caught on a
settings screen rather than by a customer waiting for something that was never ordered. When that
supplier ships, the tracking it reports becomes a shipment on the customer's order and reaches them
through the same email and portal as anything the business ships itself.

Shipping supports deterministic country and region zones, flat and weight-based delivery,
order-value bands and free-shipping thresholds. A zone can instead ask a real carrier what the parcel
costs, using the business's own carrier account so negotiated rates carry over; that choice is made
per zone, and a zone that asks a carrier never silently falls back to a hand-written band, because
free delivery is a decision rather than the result of an outage. Storefronts choose a quoted rate; QuickDash
re-prices catalog values, item weights and the selected rate before it records or charges the
order.

Payments supports multiple connected merchant processors per workspace, and a card processor is
connected as an account in the business's own name: the business holds it, sees its own dashboard,
receives its own payouts and handles its own disputes. QuickEngine takes no share of a sale and
therefore carries no share of the losses. A connection can also be removed, which frees the workspace
to connect a different one. Stripe and PayPal can
remain connected together, one is selected as the checkout default, and each historical payment
retains its processor so settlement and refunds never depend on whichever provider is active
today. Test and live workspaces use separate provider credentials, webhook signatures and payment
identity, and a workspace keeps a sandbox connection and a live one side by side, so switching
between them changes which money moves without reconnecting anything. Sandbox orders can never be
promoted into real business history. Everything that reads those records — the order list,
the payment list, the home screen's work queue, revenue, reports, review verification and the
notification bell — filters by mode, and a check on every build fails if a new query forgets.
Taking a payment selects the connected account matching that payment's own processor and mode, so a
business that tested before going live cannot have a real charge refused by a leftover sandbox
connection. Operators connect and resume Stripe's hosted setup
from the Payments module; custom storefronts receive the browser-safe account context required to
confirm the resulting direct charge without receiving a server key. Customer confirmation is
raised only after provider-verified settlement, never when an unpaid order is first drafted. A
customer buying on a recurring plan has their payment method kept on file at that first payment,
with their agreement, and each renewal charged against it without them present; a failed renewal is
retried and the subscription goes past due before it is ever cancelled.
QuickDash reads each order as one operational record: purchased items and price breakdown,
snapshotted destination, payment and refund state, and shipment progress. Shipment creation uses
that destination as its editable starting point rather than duplicating data entry. A full refund
returns the goods to stock, with an explicit choice beside the amount for the times they are not
coming back; a partial refund is an amount rather than a list of items, so it restocks nothing and
does not pretend to.

---

## Two audiences, two surfaces

**Operators** run their business in QuickDash: a session or a secret key, every module they
enabled, everything in the workspace.

**Their customers** — a shopper, a client, a patient, a student — reach `/v1/customer/*` with a
publishable key and a session of their own. They see their own orders, bookings and invoices and
nothing else, and they are a separate kind of identity: no seat, no team membership, no route
into anybody's dashboard. The business embeds that experience in its own site, as Caffeinate
does. The old hosted portal is retired — its address no longer resolves — and survives in the
repository only as reference code for building those
customer-owned surfaces; it is not a deployed product surface.

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
Resend · Vercel Blob · Algolia · Sentry · Pusher · Inngest · **Biome** ·
pnpm + Turborepo · Vercel

```txt
apps/quickengine/{web,auth,account}   the frontends
apps/quickdash/web                    the operator's workspace
apps/quickdash/portal                 retired; reference code only, no longer deployed
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
pnpm db:migrate
pnpm dev                # everything
```

Individually: `pnpm web` · `pnpm auth` · `pnpm account` · `pnpm dash` · `pnpm api`

```sh
pnpm check              # Biome + boundary ratchet + error-map check
pnpm typecheck
pnpm test
```

Security vulnerabilities should be reported privately according to [SECURITY.md](SECURITY.md),
never through a public issue containing an exploit, credential or customer data.

## Plans

| | Free | Launch | Grow | Scale | Expand | Custom |
|---|---|---|---|---|---|---|
| Price / mo | $0 | $30 | $90 | $240 | **$25 per seat** | conversation |
| Seats | 1 | 3 | 8 | 20 | 12 minimum | custom |
| Workspaces | 1 | 2 | 5 | 15 | per-seat model | custom |
| Storage | 2 GB | 25 GB | 150 GB | 500 GB | 50 GB per seat | custom |
| API requests | 50k | 250k | 1M | 5M | 500k per seat | custom |
| AI actions | 25 | 500 | 2,500 | 10,000 | 1,500 per seat | custom |

Annual is ten months on every tier. **Expand bills per seat and is planned to start at 12.**
QuickEngine is pre-release: this table is the intended launch model, while final entitlement,
extra-seat, overage and live Stripe behavior still must be completed and verified before paid
subscriptions open.

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

**The backend feature line and bounded pre-UI security implementation are closed.** The pass
slice prevents outbound webhooks from reaching private networks, clears the production npm
advisory set, continuously analyzes changes with CodeQL and pins CI dependencies immutably. The
second gives every deployed web surface an enforced browser policy, makes session revocation
immediate, removes retired trusted origins and prevents API responses from entering shared
caches. It also protects sensitive files and provider tokens, attacks every API route for tenant
confusion, establishes recovery and incident controls, and verifies the published Quick.js package
from a clean install. External production drills remain explicit launch gates. The UI/UX pass
resumes from Workspace
Connect: sign up, create a workspace, tell it where your site lives, paste three lines of
configuration, and the page confirms itself the moment your site makes its first request. A key
is locked to the addresses you name, so one copied out of your page source cannot be used to
build another website. Proven on a freshly created account against a real storefront.
Every operator page now says what it is doing: a skeleton in the shape of the page while it
loads, and a short line saying what a list is for when it is empty. Failures are told apart by
what they mean rather than by how serious they sound: a list that could not load reports it on a
single line and keeps its search and filters, while a page that cannot exist at all replaces the
whole screen and withdraws the controls that would act on nothing. Workspaces are addressed by name rather than by an internal identifier.
Lists are real tables that can be switched to cards, paged, and dragged into whatever order suits
the person reading them; every record opens in a panel over the list, and creating one uses the
same panel. A catalog can be built from the console: products with pricing, stock, photographs and
categories, the suppliers behind them, and a detail page for every other record a business keeps.
QuickDash also tells you when something needs you: a paid order, a customer waiting on a reply, a
disputed payment, a flagged shipment or stock running low reaches the bell, marks the sidebar row
it belongs to, and appears briefly in the corner if you are watching. A sandbox workspace and a live one never share
that bell, so a test order and a real customer paying are never the same news, while account-level
notices such as an invitation appear in both.
Customer email is the business’s own voice: a workspace sends from its own verified address, and every
customer-facing message can be rewritten as a whole HTML document, previewed with realistic contents
and test-sent to the operator before a customer sees it. Only the order details stay system-owned,
so a template can never promise a total that was not charged.
The frontends run on Vite and TanStack; **Next.js is gone entirely**. Automation and workflow
orchestration stay deliberately out of the current delivery path — the goal is one complete,
truthful business workflow before the ecosystem widens.

Not open source. All rights reserved.
