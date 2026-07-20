# QuickEngine Software

**Build more. Switch less.**

QuickEngine Software is building a modular business operating system for freelancers,
creators, agencies, shops, service businesses, and growing teams. QuickEngine owns the
account, identity, workspace, access, and billing layer. QuickDash is the flagship
workspace product, where a business enables only the operational modules it needs.

One QuickDash deployment serves many securely isolated workspaces. A workspace can be used
directly through QuickDash, or driven by a custom frontend through the Quick.js SDK and the
public API. New business types are assembled as reusable module recipes rather than forked
into separate applications.

## Product Boundaries

- **QuickEngine Web** — public company and product entry point.
- **QuickEngine Auth** — shared signup, login, verification, passkeys, two-factor, and
  session authority for every surface.
- **QuickEngine Account** — onboarding, organizations, workspaces, module management, team
  and roles, billing, usage, and security.
- **QuickDash** — workspace-scoped business operations at `dash.quickengine.xyz/{workspace}`.
- **Quick.js** — typed client for custom storefronts and integrations, with a `quick` CLI
  alongside it.

Automation and workflow orchestration remain deliberately separate from the current QuickDash
delivery path. The goal is a complete, truthful business workflow before the ecosystem widens.

## Monorepo Layout

```txt
quickengine/
  apps/
    quickengine/
      web/       public site (port 3000)
      account/   account and workspace management (port 3001)
      auth/      authentication authority (port 3002)
    quickdash/
      admin/     multitenant business workspace (port 3011)
  packages/
    modules/          isolated QuickDash business capabilities
    module-registry/  module catalog, manifests, and dependency resolver
    auth/ db/ ui/     shared platform foundations
    billing/          Stripe, plans, metering
    events/           domain-event bus (QuickEvents)
    realtime/ jobs/   Pusher and Inngest behind provider seams
    search/ cache/    Algolia and Redis behind provider seams
    storage/ email/   Vercel Blob / local, and Resend
    notifications/    in-app inbox plus email delivery
    sdk/              Quick.js client foundation
    cli/              `quick` command-line tool
    e2e-tests/        Playwright browser coverage
    integration-tests/ cross-module regression suite
    agent-*/          bounded, provider-neutral execution foundations
  docker/             local PostgreSQL and Redis
  native/ services/ templates/   reserved scaffolding, not yet in use
```

## Module Architecture

Every module owns a stable manifest, a configuration contract, its own database schema, and a
business service boundary. Workspace registry rows determine which modules QuickDash loads,
and dependency resolution prevents configurations that would break downstream workflows —
enabling Shipping, for example, brings Orders and its prerequisites with it.

The fifteen first-wave modules are Client Records, Invoicing, Payments, Fulfillment,
Products & Services, Orders, Inventory, Shipping, Bookings, Projects & Tasks, Time Tracking,
Files & Documents, Quotes & Estimates, Contracts & E-sign, and Reporting & Analytics.

New workspaces start with Client Records, Invoicing, Payments, and Fulfillment enabled as a
sensible default. **They are a default, not a requirement** — every module can be switched
off, blocked only by a genuine dependency from another enabled module. A searchable recipe
catalog maps business types (plumber, photographer, online store, agency, clinic…) onto
starting module sets, so a workspace can be configured by recognition rather than by studying
a module list.

## Building Against QuickDash

A workspace exposes a public `/api/v1` surface authenticated by workspace-scoped API keys —
publishable keys for browser-safe reads and telemetry, secret keys for server-side use — with
`@quickengine/quick` as the typed client and a `quick` CLI for terminal access. The surface is
early: catalog reads and traffic events today, with business resources following.

If you build your frontend with an AI coding agent, point it at **`/agents.txt`** — a
machine-readable integration guide covering the base URL, header contract, available routes,
SDK entry points, and error shape, so an agent can wire up without being handed documentation.

## Local Development

```sh
pnpm install
cp .env.example .env.local
pnpm docker:up
pnpm db:migrate
pnpm dev
```

Useful focused commands:

```sh
pnpm web       # QuickEngine Web
pnpm auth      # QuickEngine Auth
pnpm user      # QuickEngine Account
pnpm dash      # QuickDash
pnpm dev:app   # auth + account + quickdash together

pnpm check     # Biome
pnpm typecheck
pnpm test      # unit and integration suites
pnpm build
```

Local PostgreSQL runs on port `5435` and Redis on `6381`. Confirm `DATABASE_URL` targets the
Docker database before running any schema command locally — the test suites refuse to run
against a non-local host, but application commands cannot make that check for you.

## Testing

Unit and integration suites run against a real PostgreSQL database created per package, with
committed migrations applied, so migration drift is caught by the suite rather than in
production. Browser coverage runs through Playwright against a live QuickDash instance and is
local-only by design (`pnpm --filter @quickengine/e2e-tests e2e`), so continuous integration
stays fast.

## Engineering Standards

- Next.js 16 App Router, React 19, and strict TypeScript
- pnpm and Turborepo
- Biome formatting and linting
- Drizzle ORM with PostgreSQL (Neon in production)
- Better Auth as one shared authentication authority
- Tailwind CSS and shared shadcn/Radix components
- Provider seams for billing, storage, jobs, realtime, search, and caching, each selected
  from the environment so local development and tests run offline
- Sentry error monitoring across every app
- Server-side idempotency on every create path, so a retry or double submit cannot duplicate
  a record
- Integer smallest-unit money values and workspace-scoped authorization throughout
- Infrastructure usage may be metered; customer business outcomes are never metered

QuickEngine Software is the canonical company name. QuickDash is its flagship product.
