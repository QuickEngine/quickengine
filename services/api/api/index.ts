import { handle } from "hono/vercel";
import app from "../dist/index.js";

/**
 * Vercel entry point for the QuickEngine API.
 *
 * The application itself is runtime-agnostic: `src/app.ts` speaks the Web
 * `Request`/`Response` contract, so this file and `src/server.ts` (the local Node
 * server) are the only places that know how the app is being served. Moving hosts
 * means writing another adapter, never touching a route.
 *
 * `vercel.json` rewrites every path here, so Hono does all the routing — including
 * `/health`, `/ready`, `/version`, and `/openapi.json`, which are not under `/v1`.
 *
 * **This must import `dist`, not `src`.** Vercel transpiles this file but does not
 * bundle what it imports, so a `../src/index` import survives into the deployment
 * as a runtime ESM specifier pointing at TypeScript that was never compiled —
 * `ERR_MODULE_NOT_FOUND` on every invocation. `tsup` inlines every workspace
 * package into `dist`, which is the only form the function can actually load.
 *
 * The cost is that typechecking this file needs `dist/index.d.ts` to exist, so
 * `services/api/turbo.json` makes this package's `typecheck` depend on its own
 * `build`. Turbo's root config only depends on `^build` (upstream packages).
 */
export const config = {
	// Postgres, the Redis TCP fallback, and node:crypto in the webhook signer all
	// need real Node, not the edge runtime.
	runtime: "nodejs",
};

export default handle(app);
