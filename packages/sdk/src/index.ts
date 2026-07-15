import { QuickClient } from "./client";
import type {
	QuickBrowserCredential,
	QuickClientOptions,
	QuickCredential,
	QuickServerCredential,
} from "./types";

export { QuickClient } from "./client";
export { QuickApiError } from "./error";
export type * from "./types";

export const createQuick = (options: QuickClientOptions<QuickCredential>) =>
	new QuickClient(options);

export const createQuickBrowser = (
	options: QuickClientOptions<QuickBrowserCredential>,
) => new QuickClient(options);

export const createQuickServer = (
	options: QuickClientOptions<QuickServerCredential>,
) => new QuickClient(options);
