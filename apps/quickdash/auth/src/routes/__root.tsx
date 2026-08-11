import { ConnectionBanner, STATUS_URL } from "@quickengine/ui";
import {
	isStaleChunkError,
	recoverFromStaleChunk,
} from "@quickengine/ui/lib/stale-chunk";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthButton, AuthScreen, authLink } from "@/components/auth-screen";
import { env } from "@/lib/env";

/**
 * The identity app shell.
 *
 * Replaces Next's `layout.tsx` plus `error.tsx`, `not-found.tsx` and
 * `loading.tsx` — those were framework file names; here they are explicit props.
 *
 * No theme provider: auth is dark-only by design, so the class on `<html>` in
 * `index.html` is the whole implementation.
 *
 * ⚠️ These screens use `AuthScreen`, the same shell as every other page in this
 * app. They previously used `StatusScreen` and `RequestErrorScreen` from
 * `@quickengine/ui` — shared components built for the OLD theme, which is why a
 * 401 in QuickDash surfaced as an unstyled page mid-flow. An error screen that
 * looks like a different product is the worst moment to look like a different
 * product.
 */
export const Route = createRootRoute({
	component: RootLayout,
	errorComponent: ErrorScreen,
	notFoundComponent: NotFoundScreen,
	pendingComponent: PendingScreen,
});

function RootLayout() {
	return (
		<>
			{/* The same banner the marketing site uses, from `@quickengine/ui`. Above
			    the outlet so it survives navigation between screens rather than being
			    torn down and rebuilt on each one, which on a flaky connection is
			    exactly when it would be remounting. */}
			<ConnectionBanner />
			<Outlet />
		</>
	);
}

/**
 * ⚠️ Deliberately near-empty. A route resolves in milliseconds here, and a
 * spinner that appears and vanishes inside one frame reads as a flicker — worse
 * than nothing. The background is already on screen, so this simply holds the
 * frame steady.
 */
function PendingScreen() {
	return <AuthScreen title="" />;
}

/**
 * ⚠️ Worded to match the marketing site's 404 exactly. These two apps are one
 * site to anyone using them, and an error page is where that illusion is most
 * easily broken — it is the screen nobody rehearses.
 *
 * `legal={false}` on all three: the terms and privacy line belongs under a form
 * someone is about to submit, not under an apology.
 */
function NotFoundScreen() {
	return (
		<AuthScreen
			title="That page isn't here."
			subtitle="The link may be old, or the page may not be built yet."
			swap={{ label: "Sign In", href: "/signin" }}
			legal={false}
		>
			<AuthButton href="/signin">Go to sign in</AuthButton>
		</AuthScreen>
	);
}

/**
 * 503 — planned maintenance.
 *
 * Not routed, the same as the marketing site's: nothing in the app decides to
 * render it. It exists so the screen is designed before the day it is needed,
 * which is never a day anyone has time to design one.
 */
export function MaintenanceScreen() {
	return (
		<AuthScreen
			title="Back in a few minutes."
			subtitle="We're making a change that needs everything briefly offline. Your account is untouched."
			home
			legal={false}
		>
			<AuthButton href={STATUS_URL}>Live status</AuthButton>
		</AuthScreen>
	);
}

/**
 * The last line of defence: something threw where nothing was meant to.
 *
 * 🔴 The message is NOT shown. `error.message` on an auth surface can carry a
 * stack frame, an internal path, or a database string — the exact detail an
 * attacker wants and no visitor can use. It goes to the console for whoever is
 * debugging and nowhere else.
 */
function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
	if (import.meta.env.DEV) console.error(error);

	// A chunk that stopped existing is not a crash. Recover instead of accusing
	// ourselves of a failure in front of someone who is only trying to sign in.
	const stale = isStaleChunkError(error);
	const [recovering, setRecovering] = useState(stale);
	useEffect(() => {
		if (!stale) return;
		// `false` means a reload was tried moments ago and did not help, so this is
		// a real failure and earns the real screen.
		if (!recoverFromStaleChunk()) setRecovering(false);
	}, [stale]);

	// Reloading. `AuthScreen` with no title is this app's blank frame — the
	// gradient is already painted, so there is nothing to flash.
	if (recovering) return <AuthScreen title="" />;

	if (stale) {
		return (
			<AuthScreen
				title="There's a newer version of this page."
				subtitle="We shipped an update while you had this open. Reloading picks it up."
				home
				legal={false}
			>
				<AuthButton type="button" onClick={() => window.location.reload()}>
					Reload
				</AuthButton>
			</AuthScreen>
		);
	}

	return (
		<AuthScreen
			title="Something went wrong on our end."
			subtitle="This one is ours, not yours. Try again."
			swap={{ label: "Sign In", href: "/signin" }}
			legal={false}
		>
			<div className="flex flex-col gap-4">
				<AuthButton type="button" onClick={reset}>
					Try again
				</AuthButton>
				<p className="text-center font-body font-light text-[0.8125rem] text-white/50">
					Still stuck?{" "}
					<a href={`${env.VITE_WEB_URL}/support`} className={authLink}>
						Contact support
					</a>
				</p>
			</div>
		</AuthScreen>
	);
}
