import { authClient } from "@quickengine/auth/client";
import {
	LoadingScreen,
	RequestErrorScreen,
	StatusScreen,
	textLink,
} from "@quickengine/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { clientEnv } from "../lib/env";
import {
	clearHadSession,
	hadSession,
	markHadSession,
} from "../lib/had-session";
import {
	clearNativeToken,
	isNativeShell,
	nativeAuthHeaders,
} from "../lib/native-auth";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		beforeLoad: async ({ location }) => {
			if (location.pathname.startsWith("/sign/")) return {};
			if (location.pathname === "/native-signin") return {};
			try {
				// The shell has no cookie — its sign-in happened in the system browser,
				// a different process — so it carries the session token explicitly.
				// Empty in a browser, where the first-party cookie is enough.
				const { data } = await authClient.getSession({
					fetchOptions: { headers: nativeAuthHeaders() },
				});
				if (data?.session && data.user) {
					markHadSession();
					return { user: data.user };
				}
			} catch {
				// QuickDash fails closed. An unverifiable session may not see workspace data.
			}

			// 🔴 The shell must NOT be sent to `auth.quickdash.xyz`. Signing in there
			// would happen inside this window, which is an embedded webview — exactly
			// the surface Google degrades and can refuse. A stale token is dropped
			// first so the handoff starts from nothing.
			if (isNativeShell()) {
				clearNativeToken();
				throw redirect({ to: "/native-signin" });
			}

			const target = new URL("/signin", clientEnv.AUTH_URL);
			target.searchParams.set(
				"redirect",
				window.location.origin + location.href,
			);
			// ⚠️ Only claim the session EXPIRED when there was one to expire. This
			// guard also catches a first-time visitor who has never signed in, and
			// telling them their session ended is a lie that reads as a bug. The
			// marker is set below once a session is confirmed, so its presence is
			// the difference between "you were signed in" and "you never were".
			if (hadSession()) {
				target.searchParams.set("reason", "expired");
				clearHadSession();
			}
			throw redirect({ href: target.toString() });
		},
		component: () => <Outlet />,
		errorComponent: ErrorScreen,
		notFoundComponent: NotFoundScreen,
		pendingComponent: LoadingScreen,
	},
);

function NotFoundScreen() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That QuickDash page doesn't exist."
			action={
				<a href="/" className={textLink}>
					Back to QuickDash
				</a>
			}
		/>
	);
}

function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
	return (
		<RequestErrorScreen
			error={error}
			onRetry={reset}
			homeHref="/"
			homeLabel="Back to QuickDash"
		/>
	);
}
