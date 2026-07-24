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
- `GET /ready` — bounded database and request-control-store readiness;
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

The write-reliability baseline caps ordinary request bodies at 1 MiB, supplies cooperative
10-second deadlines, defines principal/workspace-scoped Redis rate budgets, and standardizes
durable mutation provenance, idempotency outcomes, audit intents, and transactional outbox
intents. No public Hono mutation is exposed until its Postgres adapter can commit domain state,
the idempotency result, audit evidence, and outbox record atomically. File uploads use a later
signed/direct-upload path rather than bypassing the JSON ceiling.
