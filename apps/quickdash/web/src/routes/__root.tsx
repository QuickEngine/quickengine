import { authClient } from "@quickengine/auth/client";
import {
	LoadingScreen,
	primaryButton,
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		beforeLoad: async ({ location }) => {
			if (location.pathname.startsWith("/sign/")) return {};
			try {
				const { data } = await authClient.getSession();
				if (data?.session && data.user) return { user: data.user };
			} catch {
				// QuickDash fails closed. An unverifiable session may not see workspace data.
			}
			const target = new URL("/signin", clientEnv.AUTH_URL);
			target.searchParams.set(
				"redirect",
				window.location.origin + location.href,
			);
			throw redirect({ href: target.toString() });
		},
		component: Outlet,
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

function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
	return (
		<StatusScreen
			code="500"
			title="Something went wrong"
			message="QuickDash couldn't load this page. Try again in a moment."
			action={
				<button type="button" onClick={reset} className={primaryButton}>
					Try again
				</button>
			}
		/>
	);
}
