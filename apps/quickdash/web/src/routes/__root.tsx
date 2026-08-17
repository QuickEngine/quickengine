import { resolveSession } from "@quickengine/auth/session";
import { RequestErrorScreen, StatusScreen, textLink } from "@quickengine/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { SkeletonScreen } from "../components/skeletons";
import { ToastProvider } from "../components/toast";
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
			/**
			 * 🔴 "You have no session" and "I could not ask" are DIFFERENT answers,
			 * and treating them alike is what signs people out at random.
			 *
			 * A thrown request means the auth service was unreachable for a moment —
			 * a restarting API in development, a cold start or a dropped connection
			 * in production. Redirecting on that sends somebody with a perfectly
			 * valid session to a login page, and because the session IS valid they
			 * sign in, come back, and hit the next blip the same way.
			 *
			 * So a REFUSAL redirects immediately, and a FAILURE is retried until the
			 * service has had a fair chance to answer. QuickDash still fails closed:
			 * once the attempts are exhausted, an unverifiable session sees no
			 * workspace data.
			 */
			/**
			 * 🔴 Asked through `resolveSession`, which caches briefly and separates
			 * "no session" from "could not ask". Calling Better Auth directly on
			 * every navigation exceeded its 100-per-minute limit during ordinary
			 * clicking, and the 429 that came back was read as a sign-out — which
			 * is why browsing the sidebar kept throwing people to the login page.
			 *
			 * Retries remain, spanning ~6 seconds, for the case the service is
			 * genuinely restarting: a development server or a cold serverless start
			 * routinely takes several seconds, and giving up sooner than the server
			 * takes to answer is the same bug with extra steps.
			 */
			for (const wait of [0, 400, 1200, 2200, 2500]) {
				if (wait > 0) {
					await new Promise((resolve) => setTimeout(resolve, wait));
				}
				const session = await resolveSession(nativeAuthHeaders);
				if (session.status === "signed-in") {
					markHadSession();
					return { user: session.user };
				}
				// A definite answer. Retrying cannot change it.
				if (session.status === "signed-out") break;
				// `unknown` — the service did not answer usefully. Try again.
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
		// The toast overlay is mounted at the root so any view can raise one
		// without each route re-providing it. It renders nothing until it has to.
		component: () => (
			<ToastProvider>
				<Outlet />
			</ToastProvider>
		),
		errorComponent: ErrorScreen,
		notFoundComponent: NotFoundScreen,
		/**
		 * 🔑 The DASHBOARD loading, not a page's content.
		 *
		 * Shown while a route resolves, before any layout is known — which is why
		 * it is the plain mark rather than a skeleton: there is nothing yet whose
		 * shape could be mirrored. Skeletons take over the moment a page has
		 * rendered and is only waiting on its data.
		 *
		 * Replaces the auth shell's loading screen, which belonged to sign-in and
		 * carried its own chrome into the console.
		 */
		pendingComponent: SkeletonScreen,
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
