# Packages

Shared QuickEngine code lives under `packages/`.

Packages are promoted here when two or more apps need the same capability, or when the capability is part of the company platform rather than one product.

## Core Packages

```txt
packages/
  ui/       shared shadcn/Tailwind/Radix UI system
  auth/     shared Better Auth setup
  db/       shared Drizzle schema and database tooling
  config/   shared TypeScript and tooling config
  apps/     canonical suite app roster and app metadata
  types/    shared TypeScript contracts
  sdk/      Quick.js typed client foundation (`@quickengine/quick`)
  env/      shared environment validation helpers
  billing/  subscription and entitlement boundary
  cache/    Redis-compatible cache boundary
  email/    transactional email boundary
  jobs/     background jobs and scheduled tasks boundary
  storage/  file/media storage boundary
  analytics/ analytics and monitoring boundary
  search/   search indexing and query boundary
  realtime/ realtime events and notifications boundary
  monitoring/ error capture and observability boundary
```

App-specific code should stay inside the app until it becomes reusable across the suite.
