# Apps

All QuickEngine products live under `apps/`.

Each product follows the two-app pattern from the internal architecture docs:

- `web` is public-facing: marketing, landing pages, public tools, signup entry points.
- `admin` is authenticated: dashboards, account screens, billing flows, and app-specific workspaces.

## Current Apps

```txt
apps/
  quickengine/
    web/      company site, suite landing, auth entry
    admin/    account, billing, subscriptions, app access
```

`quickengine` is the umbrella shell and the front door to the suite. Product apps will be added back here when they are ready to build.
