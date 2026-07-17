# QuickEngine Software

**Build more. Switch less.**

QuickEngine Software is building a modular business operating system for freelancers,
creators, agencies, shops, service businesses, and growing teams. QuickEngine owns the
account, identity, workspace, access, and billing layer. QuickDash is the flagship
workspace product where a business uses only the operational modules it needs.

One QuickDash deployment serves many securely isolated workspaces. A workspace can use
QuickDash directly or connect a custom frontend through the developing Quick.js SDK and
storefront API. New business types are assembled as reusable module recipes rather than
forked into separate applications.

## Product Boundaries

- **QuickEngine Web** — public company and product entry point.
- **QuickEngine Auth** — shared signup, login, verification, 2FA, and session authority.
- **QuickEngine Account** — onboarding, account, organization, workspace, module, and
  future billing administration.
- **QuickDash** — workspace-scoped business operations at
  `dash.quickengine.xyz/{workspace}`.
- **Quick.js** — typed client foundation for custom storefronts and integrations.

Future product directions such as automation and workflow orchestration remain separate
from the current QuickDash delivery path. The immediate goal is a complete, truthful
Web2 business workflow before expanding the ecosystem.

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
    module-registry/  workspace module catalog and dependency resolver
    auth/ db/ ui/     shared platform foundations
    sdk/              Quick.js client foundation
    agent-*/          bounded, provider-neutral execution foundations
  docker/             local PostgreSQL and Redis
  native/             future Tauri surfaces
  services/           future standalone services when justified
  templates/          reusable app scaffolding
```

## Module Architecture

Every module owns a stable manifest, configuration contract, database schema, and
business service boundary. Workspace registry rows determine which modules QuickDash
loads, while dependency resolution prevents configurations that would break downstream
workflows.

The universal business loop is:

```txt
Client Records → Invoicing → Payments → Fulfillment
```

The first-wave catalog also includes Products & Services, Orders, Inventory, Bookings,
Shipping, Projects & Tasks, Time Tracking, Files & Documents, Quotes & Estimates,
Contracts & E-sign, and Reporting & Analytics.

## Local Development

```sh
pnpm install
cp .env.example .env.local
pnpm docker:up
pnpm db:push
pnpm dev
```

Useful focused commands:

```sh
pnpm web       # QuickEngine Web
pnpm auth      # QuickEngine Auth
pnpm user      # QuickEngine Account
pnpm dash      # QuickDash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

Local PostgreSQL runs on port `5435` and Redis on `6381`. Confirm `DATABASE_URL`
targets the Docker database before using schema mutation commands locally.

## Engineering Standards

- Next.js 16 App Router, React 19, and strict TypeScript
- pnpm and Turborepo
- Biome formatting and linting
- Drizzle ORM with PostgreSQL (Neon production)
- Better Auth as one shared authentication authority
- Tailwind CSS and shared shadcn/Radix components
- Provider boundaries for billing, storage, jobs, realtime, search, and observability
- Integer smallest-unit money values and workspace-scoped authorization
- Infrastructure usage may be metered; customer business outcomes are never metered

QuickEngine Software is the canonical company name. QuickDash is its flagship product.
