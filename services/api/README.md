# QuickEngine API

The canonical HTTP boundary for QuickEngine and QuickDash. The application in
`src/app.ts` uses the Web `Request`/`Response` contract; runtime adapters stay in entry
files so deployment can move without rewriting routes.

## Local development

```sh
pnpm api
```

The default origin is `http://localhost:3020`. Copy `.env.example` values into the
repository's ignored local environment when overrides are needed.

```sh
pnpm test:api
pnpm --filter @quickengine/api typecheck
pnpm --filter @quickengine/api build
```

Foundation endpoints:

- `GET /health` — process liveness;
- `GET /ready` — dependency readiness (empty until dependencies are introduced);
- `GET /version` — deployed API version;
- `GET /openapi.json` — initial OpenAPI 3.1 document.

## Vercel baseline

Create a separate Vercel project rooted at `services/api`. Hono's Vercel adapter is the
default application export in `src/index.ts`; no Next.js application owns this service.
Set `API_BASE_URL` to the canonical API origin and `API_CORS_ORIGINS` to a comma-separated
allowlist for the deployed first-party clients. Production deployment and module routes are
deliberately later Step 8 slices. The platform core already defines dependency-injected
session/API-key authentication, workspace and RBAC context, CSRF/CORS policy, audit actors,
structured redacted logging, OpenTelemetry spans, and optional Sentry capture; module routes
begin consuming that gate in later verticals.
