import { Background } from "@quickengine/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "../components/theme-provider";

/**
 * The shell every marketing page renders inside.
 *
 * Replaces Next's `app/layout.tsx`. Two things that used to be framework
 * conventions are now explicit and live here instead:
 *
 * - **Fonts** were `next/font`, which self-hosted and preloaded them at build
 *   time. They are now plain CSS in the shared UI package, so nothing about the
 *   font pipeline depends on a framework.
 * - **Metadata** was Next's `metadata` export. Per-route titles are set with
 *   `head` on each route; the site-wide defaults live in `index.html`.
 */
export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	return (
		<ThemeProvider>
			<Background />
			<Outlet />
		</ThemeProvider>
	);
}
