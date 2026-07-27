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

## Deployment (Vercel)

The API is its own Vercel project — `api.quickengine.xyz`. Hono is runtime-agnostic, so
only the entry files know how the app is served: `api/index.ts` (Vercel) and
`src/server.ts` (self-hosted Node). Routes never change when the host does.

### One-time project setup

Vercel dashboard settings that are **not** expressible in `vercel.json`:

| Setting | Value | Why |
|---|---|---|
| Root Directory | `services/api` | The project is one workspace package. |
| Include source files outside Root Directory | **on** | The function imports `@quickengine/*` workspace packages. Without this the build cannot see them. |
| Framework Preset | Other | This is not a Next app. |
| Build / Install Command | leave overrides **off** | `vercel.json` sets them. |
| Output Directory | `public` | See below — not cosmetic. |
| Node.js Version | 24.x | Match the other four projects. |

`vercel.json` rewrites every path to the single function, so Hono does all routing —
including `/health`, `/ready`, `/version`, and `/openapi.json`, which are not under `/v1`.

**`outputDirectory` must stay pointed at the empty `public/` folder.** Vercel matches static
files before rewrites, and with no output directory it falls back to serving the project root —
which here is this service's own source tree, making `/package.json` and `/tsconfig.json`
publicly readable. An empty folder gives it nothing to match, so every request reaches the
function.

### Environment variables

The env contract is validated **at module load**, so a missing required variable crashes
the function on cold start rather than failing per-request. Set them before the first
deploy. At minimum this service needs what `packages/env/src/server.ts` marks required —
`DATABASE_URL` and `BETTER_AUTH_SECRET` among them — plus:

- `API_BASE_URL` — the canonical origin, `https://api.quickengine.xyz`.
- `API_CORS_ORIGINS` — comma-separated allowlist of first-party clients (web, auth,
  account, dash). Credentialed CORS is rejected for anything absent.

`DATABASE_IS_PRODUCTION=true` plus a non-production `VERCEL_ENV` makes the connection
refuse to boot, so preview deployments cannot reach the production database. Point preview
`DATABASE_URL` at a preview branch.

### Why the Vercel entry is hand-written

`handle()` from `hono/vercel` is the **Edge** adapter — it assumes the platform passes a
Web `Request`. This function runs on the **Node** runtime, which Postgres, the Redis TCP
fallback, and `node:crypto` in the webhook signer all require. There, Vercel passes Node's
`IncomingMessage`/`ServerResponse`, and the Edge adapter fails on the first request with
`this.raw.headers.get is not a function`. `@hono/node-server` shipped a Vercel adapter in
v1 but dropped it in v2, so `api/index.ts` does the translation itself.

Two details in it are load-bearing: the request body is **streamed**, not buffered, so the
body-limit middleware can reject an oversized upload as bytes arrive; and `Set-Cookie` is
copied via `getSetCookie()` rather than `Headers.forEach`, which would join multiple
cookies into one unusable value and break session writes.

Verify it without deploying by mounting the handler on a real `node:http` server and
issuing requests against it — that reproduces the exact object shapes Vercel supplies.

### Why `api/index.ts` imports `dist`, not `src`

Vercel **transpiles** the function entry but does not bundle what it imports. An
`import app from "../src/index"` therefore survives into the deployment as a runtime ESM
specifier pointing at TypeScript that was never compiled, and every invocation fails with
`ERR_MODULE_NOT_FOUND`. `tsup` inlines every workspace package into `dist`, which is the
only form the function can load — and `vercel.json` pins `includeFiles: "dist/**"` so the
artifact is definitely shipped rather than relying on file tracing.

The trade-off is that typechecking the entry needs `dist/index.d.ts`, so
`services/api/turbo.json` makes this package's `typecheck` depend on its own `build`
(turbo's root config only depends on `^build`, i.e. upstream packages). Deleting `dist`
and running `pnpm turbo typecheck --filter=@quickengine/api` is the way to verify that
still holds.

### Runtime notes

- **Node runtime, not edge.** Postgres, the Redis TCP fallback, and `node:crypto` in the
  webhook signer all require it. `api/index.ts` pins this.
- **Connections.** Use Neon's pooled host and Upstash REST for cache; the cache provider
  already prefers REST precisely because a TCP socket per invocation exhausts limits.
- **Function duration.** The Inngest endpoint, once it moves here, drains outbox batches
  and delivers webhooks inside a request. If a cycle approaches the platform timeout,
  lower `batchSize`/`maxBatches` rather than raising the limit — the work is resumable by
  design and the next cycle continues it.

### Verifying a deploy

```sh
curl https://api.quickengine.xyz/health    # {"data":{"status":"ok",...}}
curl https://api.quickengine.xyz/ready     # 200 healthy, 503 if a dependency is down
curl https://api.quickengine.xyz/version
```

`/ready` is the meaningful one: it probes the database and the request-control store.

### QuickDash consumers

Inngest, realtime authorization, activity recovery, workspace search, onboarding state,
file transfer and public contract signing now run through this service. QuickDash is a static
Vite application and owns no server routes.

The write-reliability baseline caps ordinary request bodies at 1 MiB, supplies cooperative
10-second deadlines, defines principal/workspace-scoped Redis rate budgets, and standardizes
durable mutation provenance, idempotency outcomes, audit intents, and transactional outbox
intents. No public Hono mutation is exposed until its Postgres adapter can commit domain state,
the idempotency result, audit evidence, and outbox record atomically. File uploads use a later
signed/direct-upload path rather than bypassing the JSON ceiling.
