import {
	LoadingScreen,
	RequestErrorScreen,
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

function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
	return (
		<RequestErrorScreen
			error={error}
			onRetry={reset}
			homeHref="/signin"
			homeLabel="Back to sign in"
		/>
	);
}
