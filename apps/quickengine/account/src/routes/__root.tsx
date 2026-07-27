import { authClient } from "@quickengine/auth/client";
import {
	LoadingScreen,
	StatusScreen,
	primaryButton,
	textLink,
} from "@quickengine/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
	Outlet,
	createRootRouteWithContext,
	redirect,
} from "@tanstack/react-router";
import { ThemeProvider } from "../components/theme-provider";
import { clientEnv } from "../lib/env";

/**
 * The account shell, and the app's authentication boundary.
 *
 * 🔴 **This fails CLOSED, unlike marketing and sign-in.**
 *
 * `web` renders even when the session lookup breaks, because a sales page must
 * always be visible. `auth` shows the sign-in form on any error, because the
 * worst case is a signed-in user seeing a login screen.
 *
 * Neither is acceptable here. This app displays organizations, billing and team
 * membership, so an unverifiable session must be treated exactly like no session
 * at all: **error, timeout and absent all take the same path — out.** Anything
 * else flashes private data to someone whose identity we could not confirm.
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	beforeLoad: async ({ location }) => {
		let signedIn = false;
		try {
			const { data } = await authClient.getSession();
			signedIn = Boolean(data?.session);
		} catch {
			// Fall through to the redirect. An unverifiable session is not a session.
			signedIn = false;
		}
		if (!signedIn) {
			const target = new URL("/signin", clientEnv.AUTH_URL);
			target.searchParams.set("redirect", window.location.origin + location.href);
			throw redirect({ href: target.toString() });
		}
	},
	component: RootLayout,
	errorComponent: ErrorScreen,
	notFoundComponent: NotFoundScreen,
	pendingComponent: LoadingScreen,
});

function RootLayout() {
	return (
		<ThemeProvider>
			<Outlet />
		</ThemeProvider>
	);
}

function NotFoundScreen() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist."
			action={
				<a href="/" className={textLink}>
					Back to your account
				</a>
			}
		/>
	);
}

function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
	return (
		<StatusScreen
			code="500"
			title="Something went wrong"
			message="An unexpected error occurred. Try again in a moment."
			action={
				<button type="button" onClick={reset} className={primaryButton}>
					Try again
				</button>
			}
		/>
	);
}
