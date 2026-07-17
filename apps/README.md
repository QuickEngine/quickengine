# Applications

Deployable product surfaces live under `apps/`. Shared business logic belongs in
`packages/`; applications compose those boundaries into public or authenticated user
experiences.

## Current Applications

```txt
apps/
  quickengine/
    web/       public company and product site (port 3000)
    account/   onboarding, account, organization, and workspace management (port 3001)
    auth/      shared authentication authority (port 3002)
  quickdash/
    admin/     multitenant workspace operations (port 3011)
```

QuickEngine is the ecosystem account layer. QuickDash is one multitenant application,
not a separate deployment for every workspace. Its route selects a workspace and loads
that workspace's authorized registry configuration and module navigation.

Most new business capabilities should be modules under `packages/modules/`, and most
new business types should be workspace recipes. Add another application only when the
capability has an independent product boundary that cannot reasonably remain a module,
shared package, or native client surface.
