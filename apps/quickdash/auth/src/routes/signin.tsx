import { authClient } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { AuthOptions } from "@/components/auth-options";
import { AuthScreen, authLink } from "@/components/auth-screen";
import { resolveDestination } from "@/lib/destination";

/**
 * Sign in — stripped to a blank canvas on 2026-08-10, the same way the front
 * page was, so it gets rebuilt rather than retrofitted.
 *
 * ⚠️ NOTHING WAS DELETED. The working flow is intact on disk and unrendered:
 * the pre-redesign signin panel and form, which between them
 * carry password, magic link, two-factor and recovery codes. That is presentation removed, not logic.
 *
 * 🔴 `beforeLoad` STAYS. It is the redirect that keeps an already-signed-in
 * visitor from being shown a sign-in form, and it deliberately fails open — if
 * the session lookup throws, the page renders and the worst case is a signed-in
 * user seeing this screen. Do not fold it into the component during the
 * redesign; a route guard that runs after render is not a guard.
 */
const redirectIfSignedIn = async ({
	search,
}: {
	search: { redirect?: string };
}) => {
	try {
		const { data } = await authClient.getSession();
		if (data?.session) {
			window.location.href = resolveDestination(search.redirect);
		}
	} catch {
		// Show the form.
	}
};

export const Route = createFileRoute("/signin")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
		// Set by the sign-out endpoint. A flag rather than a route: a page whose
		// only content is "you signed out, now sign in" is a redirect with extra
		// steps, and the confirmation belongs where the person already is.
		// ⚠️ `undefined`, not `false`. TanStack serialises whatever this returns
		// back into the address bar, so a boolean default writes `?signedout=false`
		// onto every clean sign-in URL. Undefined is omitted.
		signedout:
			search.signedout === "1" || search.signedout === true ? true : undefined,
		// Why they were sent here. `expired` from a dead session, `oauth` when a
		// provider returned without one — cancelled consent, a stale state
		// parameter, a revoked grant.
		//
		// ⚠️ These are STATES, not routes. A page whose entire content is "that
		// did not work, sign in" is a redirect with extra steps, and it strands
		// people one click further from the form they need. The message belongs
		// where the recovery is.
		reason:
			search.reason === "expired" || search.reason === "oauth"
				? (search.reason as "expired" | "oauth")
				: undefined,
	}),
	beforeLoad: redirectIfSignedIn,
	// Empty — the split background and nothing else. The bar, the mark and
	component: Page,
});

function Page() {
	const { redirect, signedout, reason } = Route.useSearch();

	return (
		<AuthScreen
			title={
				reason === "expired"
					? "Your session ended"
					: reason === "oauth"
						? "That did not complete"
						: signedout
							? "You're signed out"
							: "Welcome back"
			}
			subtitle={
				reason === "expired"
					? "You were signed out for security. Sign back in."
					: reason === "oauth"
						? "The provider sent you back without signing you in."
						: signedout
							? "That session has ended."
							: "Any of these will get you in."
			}
			swap={{ label: "Sign Up", href: "/signup" }}
			consent={false}
		>
			<AuthOptions redirect={redirect} mode="signin" />

			{/* Below the options rather than under the title. Someone who already
			    knows they are on the wrong screen has the button in the corner; this
			    is for the person who read every option, found none of them theirs,
			    and needs the way out at the moment they realise it. */}
			<p className="mt-7 text-center font-body font-light text-[0.8125rem] text-white/50">
				Don't have an account?{" "}
				<a href="/signup" className={authLink}>
					Sign Up
				</a>
			</p>
		</AuthScreen>
	);
}
