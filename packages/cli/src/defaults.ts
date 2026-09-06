import { createRequire } from "node:module";
export const DEFAULT_API_URL = "https://api.quickdash.xyz";

/**
 * The Quick.js version new projects are scaffolded against, read from the SDK
 * itself rather than copied.
 *
 * 🔴 This used to be a literal, and the copy drifted every single time the SDK
 * was released: Release Please bumps `packages/sdk/package.json` and knows
 * nothing about a constant over here, so `scaffold.test.ts` failed and took the
 * release PR down with it. #218 sat red from 2026-08-19 for that reason, and the
 * same drift failed #495 on 2026-09-05. Deriving it makes the drift impossible
 * rather than merely detected.
 */
const require = createRequire(import.meta.url);
export const QUICK_SDK_VERSION: string = (
	require("@quickengine/quick/package.json") as { version: string }
).version;
