import {
	Background,
	LoadingScreen,
	primaryButton,
	StatusScreen,
	textLink,
} from "@quickengine/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";
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
	errorComponent: ErrorScreen,
	notFoundComponent: NotFoundScreen,
	pendingComponent: LoadingScreen,
});

function RootLayout() {
	return (
		<ThemeProvider>
			<Background />
			<Outlet />
		</ThemeProvider>
	);
}

function NotFoundScreen() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist. Head back home to continue."
			action={
				<a href="/" className={textLink}>
					Back home
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
			message="An unexpected error occurred on our end. Try again in a moment."
			action={
				<button type="button" onClick={reset} className={primaryButton}>
					Try again
				</button>
			}
		/>
	);
}
