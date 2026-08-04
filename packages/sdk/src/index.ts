import { QuickClient } from "./client";
import type {
	QuickBrowserCredential,
	QuickClientOptions,
	QuickConnectCredential,
	QuickCredential,
	QuickPublishableCredential,
	QuickServerCredential,
	QuickSessionCredential,
} from "./types";

export { QuickClient } from "./client";
export { QuickApiError } from "./error";
export type * from "./types";
export { verifyWebhookSignature } from "./webhook-signature";

export function createQuick(
	options: QuickClientOptions<QuickSessionCredential>,
): QuickClient;
export function createQuick(
	options: QuickClientOptions<QuickCredential>,
): QuickClient;
export function createQuick(
	options:
		| QuickClientOptions<QuickCredential>
		| QuickClientOptions<QuickSessionCredential>,
) {
	return new QuickClient(options);
}

export function createQuickBrowser(
	options: QuickClientOptions<QuickSessionCredential>,
): QuickClient;
export function createQuickBrowser(
	options: QuickClientOptions<QuickPublishableCredential>,
): QuickClient;
export function createQuickBrowser(
	options: QuickClientOptions<QuickConnectCredential>,
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

export const createQuickServer = (
	options: QuickClientOptions<QuickServerCredential>,
) => new QuickClient(options);

/** QuickConnect: the browser-safe bridge from any custom frontend to QuickDash. */
export const createQuickConnect = (
	options: QuickClientOptions<QuickConnectCredential>,
) => new QuickClient(options);
