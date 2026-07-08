# App Template

New apps are rare. QuickEngine is the account layer and QuickDash is the single
flagship product; most new capabilities ship as **modules inside QuickDash**
(under `packages/modules/`), and most new business types are just a new QuickDash
workspace recipe — neither needs a new app. Use this template only when a
genuinely separate app surface is required.

A new app follows this structure:

```txt
apps/[app-name]/
  web/
  admin/
```

## Required Setup

1. Create `apps/[app-name]/web`.
2. Create `apps/[app-name]/admin`.
3. Give each workspace a package name:
   - `@quickengine/[app-name]-web`
   - `@quickengine/[app-name]-admin`
4. Add app-specific `.env.example` files.
5. Add a schema file under `packages/db/src/schema/[app-name].ts`.
6. Export the schema from `packages/db/src/schema/index.ts`.
7. Add root scripts if the app needs a dedicated dev command.
8. Run `pnpm install`.
9. Run `pnpm check`, `pnpm typecheck`, and `pnpm build`.

## Port Convention

```txt
quickengine web/admin  3000 / 3001
quickengine auth       3002
quickdash web/admin    3010 / 3011
next app pair          +10 from the previous pair
```

## Shared Packages

New apps should depend on shared QuickEngine packages instead of recreating local versions:

```txt
@quickengine/auth
@quickengine/db
@quickengine/types
@quickengine/ui
@quickengine/config
```

Promote code into `packages/` only after it is needed by at least two apps or clearly belongs to the company platform.
