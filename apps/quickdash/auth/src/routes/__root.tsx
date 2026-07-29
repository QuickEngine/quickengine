import {
	LoadingScreen,
	primaryButton,
	StatusScreen,
	textLink,
} from "@quickengine/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";

/**
 * The identity app shell.
 *
 * Replaces Next's `layout.tsx` plus `error.tsx`, `not-found.tsx` and
 * `loading.tsx` — those were framework file names; here they are explicit props.
 *
 * No theme provider: auth is dark-only by design, so the class on `<html>` in
 * `index.html` is the whole implementation.
 */
export const Route = createRootRoute({
	component: () => <Outlet />,
	errorComponent: ErrorScreen,
	notFoundComponent: NotFoundScreen,
	pendingComponent: LoadingScreen,
});

function NotFoundScreen() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist."
			action={
				<a href="/signin" className={textLink}>
					Go to sign in
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
