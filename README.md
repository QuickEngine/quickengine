# QuickEngine Software

**Build more. Switch less.**

A modular business operating system for freelancers, agencies, shops, service businesses and
growing teams. **QuickEngine** owns identity, accounts and billing. **QuickDash** is the
product: one deployment serving many isolated workspaces, each enabling only the modules that
business actually needs.

A workspace can be run through QuickDash directly, or driven entirely by your own frontend
through the public API and the Quick.js SDK. New business types are assembled from reusable
module recipes rather than forked into separate applications.

---

## Surfaces

| Host | What it is |
|---|---|
| `quickengine.xyz` | The company. Marketing. No login. |
| `quickdash.xyz` | **The product.** |
| `account.quickdash.xyz` | Console — organizations, workspaces, team, billing, usage |
| `auth.quickdash.xyz` | Identity — signup, login, passkeys, TOTP, sessions |
| `api.quickdash.xyz` | The public API |
| `docs.` · `help.` · `status.` | Documentation, support, status — planned |

**QuickDash Desktop** (macOS · Windows · Linux) and **QuickDash Mobile** (iOS · Android) are
planned, both wrapping the same web product.

---

## The 15 modules

Client Records · Products & Services · Quotes & Estimates · Invoicing · Payments · Orders ·
Fulfillment · Inventory · Shipping · Projects & Tasks · Time Tracking · Bookings ·
Contracts & E-sign · Files & Documents · Reporting & Analytics

Each owns a manifest, a configuration contract, its own schema and a service boundary. Workspace
registry rows decide what QuickDash loads, and dependency resolution prevents broken
configurations — enabling Shipping brings Orders and its prerequisites with it.

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

TypeScript (strict) · **Hono** (the canonical API) · Next.js 16 → **migrating to Vite +
TanStack** · Tailwind + shadcn/ui · Drizzle + Postgres (Neon) · Better Auth · Redis · Stripe ·
Resend · Cloudinary + Vercel Blob · Algolia · Sentry · Pusher · Inngest · **Biome** ·
pnpm + Turborepo · Vercel

```txt
apps/quickengine/{web,auth,account}   the frontends
apps/quickdash/web
services/api                          the canonical Hono boundary
packages/
  modules/          15 isolated business capabilities
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

Individually: `pnpm web` · `pnpm auth` · `pnpm account` · `pnpm dash` · `pnpm api`

```sh
pnpm check              # Biome + boundary ratchet + error-map check
pnpm typecheck
pnpm test
```

⚠️ `.env.local`'s `DATABASE_URL` may point at production. Point it at Docker before running
`db:push`.

---

## Plans

| | Free | Launch | Grow | Scale | Custom |
|---|---|---|---|---|---|
| Price / mo | $0 | $30 | $90 | $240 | conversation |
| Seats | 1 | 2 | 5 | 15 | custom |
| Storage | 1 GB | 25 GB | 100 GB | 500 GB | custom |
| API requests | 10k | 250k | 1M | 5M | custom |
| AI actions | 25 | 500 | 2,500 | 10,000 | custom |

Modules are free, paid-to-unlock-then-unlimited, or resource-metered. AI beyond the included
allowance draws on prepaid credits.

---

## Status

Backend complete and deployed. Currently migrating the frontends off Next.js, then a full
UI/UX pass. Automation and workflow orchestration stay deliberately out of the current delivery
path — the goal is one complete, truthful business workflow before the ecosystem widens.

Not open source. All rights reserved.
