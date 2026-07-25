import { handle } from "hono/vercel";
import app from "../src/index";

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
 * This imports source, not `dist`. Vercel's builder compiles and bundles the
 * function itself, so the `tsup` artifact is only for the self-hosted Node path
 * (`pnpm start`). Importing `dist` here would make `typecheck` require a prior
 * `build` — turbo's `typecheck` depends on `^build` (upstream packages only), so
 * a clean checkout would fail.
 */
export const config = {
	// Postgres, the Redis TCP fallback, and node:crypto in the webhook signer all
	// need real Node, not the edge runtime.
	runtime: "nodejs",
};

export default handle(app);
