import { authClient } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth-layout";
import { SignUpPanel } from "@/components/signup-panel";
import { resolveDestination } from "@/lib/destination";

/**
 * Create an account.
 *
 * The working flow — name, email, password, `signUp.email` and the "check your
 * email" state — is untouched in `components/signup-form.tsx`. `SignUpPanel` is
 * the new layout and currently wires social plus the email hand-off; the rest
 * gets laid in from that file as it is designed.
 *
 * Send an already-authenticated visitor to their destination rather than showing
 * them a form. **Deliberately fails open** — if the session lookup errors the
 * form renders, and the worst case is a signed-in user seeing a sign-up page.
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
	component: () => (
		<AuthLayout>
			<SignUpPanel />
		</AuthLayout>
	),
});
