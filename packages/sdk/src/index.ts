import { QuickClient } from "./client";
import type {
	QuickBrowserCredential,
	QuickClientOptions,
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
