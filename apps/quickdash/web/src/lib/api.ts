import type {
	QuickBearerCredential,
	QuickSessionCredential,
} from "@quickengine/quick";
import { createQuickBrowser } from "@quickengine/quick/browser";
import { QueryClient } from "@tanstack/react-query";
import { getNativeToken } from "./native-auth";

/**
 * The credential this surface uses.
 *
 * A browser has a first-party cookie and needs nothing else. The native shell
 * has no cookie — its sign-in happened in the system browser, a different
 * process — so it carries the session token explicitly instead. Same session,
 * different transport; see `native-auth.ts`.
 */
const credential = (): QuickSessionCredential | QuickBearerCredential => {
	const token = getNativeToken();
	return token ? { type: "bearer", token } : { type: "session" };
};

export const sessionApi = createQuickBrowser({
	baseUrl: window.location.origin,
	credential: credential(),
});

export const workspaceApi = (workspaceId: string) =>
	createQuickBrowser({
		baseUrl: window.location.origin,
		credential: credential(),
		workspaceId,
	});

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 15_000,
			retry: (count, error) => {
				const status = (error as { status?: number }).status;
				return !(status && status >= 400 && status < 500) && count < 2;
			},
		},
	},
});
