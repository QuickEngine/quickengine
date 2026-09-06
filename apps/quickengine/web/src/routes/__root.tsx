import { Background, ConnectionBanner } from "@quickengine/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppErrorPage, NotFoundPage } from "../components/error-page";
import { ThemeProvider } from "../components/theme-provider";

/**
 * The shell every marketing page renders inside.
 *
 * Replaces Next's `app/layout.tsx` **plus its sibling conventions** —
 * `error.tsx`, `not-found.tsx` and `loading.tsx` were framework file names; here
 * they are explicit props on the root route. Same screens, same behaviour,
 * nothing dropped.
 *
 * Two things that were framework magic are now plain code:
 *
 * - **Fonts** were `next/font`. They are now `@font-face` in the shared UI
 *   package, so nothing about the font pipeline depends on a framework.
 * - **Metadata** was the `metadata` export. Site-wide defaults live in
 *   `index.html`; per-route titles use `head` on the route.
 */
export const Route = createRootRoute({
	component: RootLayout,
	errorComponent: AppErrorPage,
	notFoundComponent: NotFoundPage,
	// No `pendingComponent` here: `defaultPendingComponent` on the router covers
	// this route and every child with one declaration. See `main.tsx`.
});

function RootLayout() {
	return (
		<ThemeProvider>
			{/* Above the route, so it survives every navigation rather than being
			    unmounted and remounted with each page. */}
			<ConnectionBanner />
			<Background />
			<Outlet />
			{/* Every surface was designed at desktop width first, and the small
			    screen passes have not been done. Saying so is the difference between
			    a product that is under construction and one that looks broken. */}
			{/*
			 * 🔴 The small-screen wall is GONE, everywhere, 2026-09-06.
			 *
			 * It said "QuickDash needs a bigger screen" under 1024px. That was honest, and
			 * it was also a locked door on the four surfaces a stranger is most likely to
			 * open on a phone: the marketing site somebody reaches from a link, the sign-in
			 * they were sent to, the billing page where they upgrade, and the portal where
			 * a customer's own customer checks an order.
			 *
			 * ⚠️ The small-screen passes are still not done, so these layouts are cramped.
			 * Cramped and usable beats a notice telling somebody to come back on a laptop —
			 * especially on the marketing site, where turning away a phone visitor turns
			 * away the exact person outreach is meant to reach.
			 */}
		</ThemeProvider>
	);
}
