import { QuickClient } from "./client";
import type {
	QuickBearerCredential,
	QuickBrowserCredential,
	QuickClientConstructorOptions,
	QuickClientOptions,
	QuickPublishableCredential,
	QuickSessionCredential,
} from "./types";

export { QuickClient } from "./client";
export { QuickApiError } from "./error";
export type * from "./types";

/**
 * Browser-safe Quick.js entry.
 *
 * Kept separate from the package root because webhook signature verification
 * uses Node's `crypto` module and must never be pulled into a Vite bundle.
 */
export function createQuickBrowser(
	options: QuickClientOptions<QuickSessionCredential>,
): QuickClient;
export function createQuickBrowser(
	options: QuickClientOptions<QuickBearerCredential>,
): QuickClient;
/**
 * Session or bearer, chosen at runtime.
 *
 * A surface that runs both in a browser and in a native shell cannot know which
 * it has until it looks — so it passes the union. Both are the same session and
 * both may omit `workspaceId`, which is why this overload exists rather than
 * forcing a cast at every call site.
 */
export function createQuickBrowser(
	options: QuickClientOptions<QuickSessionCredential | QuickBearerCredential>,
): QuickClient;
export function createQuickBrowser(
	options: QuickClientOptions<QuickPublishableCredential>,
): QuickClient;
export function createQuickBrowser(
	options: QuickClientOptions<QuickBrowserCredential>,
): QuickClient;
// The permissive shape, so this signature does not have to be extended every
// time an overload is. The overloads above are what callers are typed against.
export function createQuickBrowser(options: QuickClientConstructorOptions) {
	return new QuickClient(options);
}
