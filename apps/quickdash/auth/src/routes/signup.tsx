import { authClient } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { AuthOptions } from "@/components/auth-options";
import { AuthScreen, authLink } from "@/components/auth-screen";
import { resolveDestination } from "@/lib/destination";

/**
 * Create an account — stripped to a blank canvas on 2026-08-10, the same way the front
 * page was, so it gets rebuilt rather than retrofitted.
 *
 * ⚠️ NOTHING WAS DELETED. The working flow is intact on disk and unrendered:
 * the pre-redesign signup panel and form, which between them
 * carry name, email, password, `signUp.email` and the check-your-email state. That is presentation removed, not logic.
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

export const Route = createFileRoute("/signup")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: redirectIfSignedIn,
	// Empty — the split background and nothing else. The bar, the mark and
	component: Page,
});

function Page() {
	const { redirect } = Route.useSearch();

	return (
		<AuthScreen
			title="Create your account"
			subtitle="No card. One workspace to start."
			swap={{ label: "Sign In", href: "/signin" }}
			consent={true}
		>
			<AuthOptions redirect={redirect} mode="signup" />

			{/* Below the options rather than under the title. Someone who already
			    knows they are on the wrong screen has the button in the corner; this
			    is for the person who read every option, found none of them theirs,
			    and needs the way out at the moment they realise it. */}
			<p className="mt-7 text-center font-body font-light text-[0.8125rem] text-white/50">
				Already have an account?{" "}
				<a href="/signin" className={authLink}>
					Sign In
				</a>
			</p>
		</AuthScreen>
	);
}
