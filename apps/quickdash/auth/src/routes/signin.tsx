import { authClient } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth-layout";
import { SignInPanel } from "@/components/signin-panel";
import { resolveDestination } from "@/lib/destination";

/**
 * Sign in.
 *
 * The full legacy flow — password, magic link, 2FA, recovery codes — is
 * untouched in `components/signin-form.tsx`. `SignInPanel` is the new layout and
 * currently wires social, passkey and the email hand-off; the remaining steps
 * get laid in from that file as they are designed.
 *
 * Send an already-authenticated visitor straight to their destination rather
 * than showing them a form. **Deliberately fails open** — if the session lookup
 * errors the form renders, and the worst case is a signed-in user seeing a
 * sign-in page.
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
	}),
	beforeLoad: redirectIfSignedIn,
	component: () => (
		<AuthLayout>
			<SignInPanel />
		</AuthLayout>
	),
});
