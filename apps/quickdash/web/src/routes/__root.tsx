import { resolveSession } from "@quickengine/auth/session";
import { HintLayer, presentRequestError, ThemeProvider } from "@quickengine/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { FullPageWall } from "../components/page-state";
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
		component: () => {
			/**
			 * 🔑 `?boom` previews the ROOT failure, and `?boom=outlet` the ordinary
			 * one. They look different on purpose: a fault at the root means the
			 * console itself never rendered, so there is genuinely nothing behind
			 * the wall, while a route failing inside a working console keeps the
			 * sidebar and header and puts the card in the outlet. See the outlet
			 * throw in `$workspace.index`.
			 *
			 * It THROWS rather than rendering the screen directly, so what you look
			 * at is the real boundary catching a real fault, not a copy that can
			 * drift. These screens are the hardest in the console to reach, which
			 * is exactly why they kept missing design passes.
			 *
			 * ⚠️ `import.meta.env.DEV` only. Vite strips the branch from a
			 * production build, so nobody can crash their console with a query
			 * string.
			 */
			if (
				import.meta.env.DEV &&
				new URLSearchParams(window.location.search).get("boom") === ""
			) {
				throw new Error("Previewing the error screen. Remove ?boom to leave.");
			}
			return (
				<ThemeProvider>
					<ToastProvider>
						<Outlet />
						{/*
						 * 🔴 GONE from the console, and only from the console.
						 *
						 * It said "QuickDash needs a bigger screen" under 1024px, which was
						 * honest while the console was a website. In the desktop app it is
						 * a wall: half of a 1512pt display is 756, so snapping the window
						 * to one side of the screen — the ordinary thing anybody does with
						 * a desktop app — replaced the entire product with a notice
						 * telling them to use a desktop.
						 *
						 * ⚠️ Still mounted on the marketing site and the customer portal.
						 * Those are pages a stranger opens on a phone, and it is the right
						 * answer there until the small screen passes are done.
						 */}
						{/* Upgrades every `title` in the product. See `HintLayer`. */}
						<HintLayer />
					</ToastProvider>
				</ThemeProvider>
			);
		},
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
		<FullPageWall
			title="That page doesn't exist"
			detail="The address is wrong, or whatever was here has moved. Nothing in your workspace has changed."
			action={
				<a href="/" className={wallAction}>
					Back to QuickDash
				</a>
			}
		/>
	);
}

/**
 * The whole app failed, not one list.
 *
 * ⚠️ The only place a bare "something went wrong" is honest: a boundary catches
 * a render fault with no status to classify, so unlike a failed request there is
 * genuinely nothing more specific to say. Everywhere else that copy is a
 * shrug, which is why it lives only here.
 */
function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
	const it = presentRequestError(error);
	return (
		<FullPageWall
			tone="var(--signal-failure)"
			title={it.title}
			detail={it.message}
			action={
				<div className="flex items-center gap-2">
					<button type="button" onClick={reset} className={wallPrimary}>
						Try again
					</button>
					<a href="/" className={wallAction}>
						Back to QuickDash
					</a>
				</div>
			}
		/>
	);
}

/**
 * 🔴 The last old buttons in the console, and the reason they survived is that
 * nobody sees this screen: it only renders when the whole app has thrown, so it
 * missed every pass. Pill shaped and ink filled, on a product where a button is
 * a rectangular raised key. Same treatment as the outlet's error card.
 */
const wallPrimary =
	"control-raised inline-flex h-8 items-center rounded-md border border-[var(--console-line-strong)] px-3 font-medium text-[12px] text-[var(--ink-90)] no-underline outline-none";
const wallAction =
	"control-raised inline-flex h-8 items-center rounded-md border px-3 text-[12px] text-[var(--ink-55)] no-underline outline-none hover:text-[var(--ink-90)]";
