# QuickEngine Software

Build more. Switch less.

QuickEngine Software is a unified suite of professional-grade web tools for individuals, freelancers, creators, and small businesses. The QuickEngine shell is the front door for the suite, and every future app shares the same auth, UI, database, config, and deployment standards.

## Monorepo Layout

```txt
quickengine/
  apps/
    quickengine/
      web/
      admin/
  packages/
    auth/
    config/
    db/
    ui/
  docker/
```

`apps/quickengine` is the company shell: public landing, authentication entry point, account management, billing, subscriptions, and suite access.

Product apps live beside it. Each product keeps the same two-app pattern:

- `web`: public marketing, public tools, landing pages, and signup entry points
- `admin`: authenticated product dashboard and account-level product experience

## Local Setup

```sh
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:push
pnpm dev
```

## Standards

- Next.js 16 App Router for web and admin apps
- pnpm 10.28.1 and Turborepo
- Biome for linting and formatting
- TypeScript strict mode
- Drizzle ORM with PostgreSQL
- Better Auth shared through `@quickengine/auth`
- Shared UI through `@quickengine/ui`
- Shared config through `@quickengine/config`

QuickEngine Software is the canonical company name.
