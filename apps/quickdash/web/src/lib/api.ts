import { createQuickBrowser } from "@quickengine/quick/browser";
import { QueryClient } from "@tanstack/react-query";

export const sessionApi = createQuickBrowser({
	baseUrl: window.location.origin,
	credential: { type: "session" },
});

export const workspaceApi = (workspaceId: string) =>
	createQuickBrowser({
		baseUrl: window.location.origin,
		credential: { type: "session" },
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
