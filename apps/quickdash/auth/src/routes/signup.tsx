import { authClient } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { SignUpForm } from "@/components/signup-form";
import { resolveDestination } from "@/lib/destination";

/**
 * Send an already-authenticated visitor straight to their destination rather
 * than showing them a sign-in form.
 *
 * This was a server guard under Next. It now runs in the browser, and
 * **deliberately fails open**: if the session lookup errors, the form renders.
 * The worst case is a signed-in user seeing a sign-in page, which is harmless —
 * unlike an authenticated surface, where failing open would leak.
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
		<Suspense>
			<SignUpForm />
		</Suspense>
	),
});
