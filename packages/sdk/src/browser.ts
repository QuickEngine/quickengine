import { QuickClient } from "./client";
import type {
	QuickBrowserCredential,
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
	options: QuickClientOptions<QuickPublishableCredential>,
): QuickClient;
export function createQuickBrowser(
	options: QuickClientOptions<QuickBrowserCredential>,
): QuickClient;
export function createQuickBrowser(
	options:
		| QuickClientOptions<QuickBrowserCredential>
		| QuickClientOptions<QuickSessionCredential>,
) {
	return new QuickClient(options);
}
