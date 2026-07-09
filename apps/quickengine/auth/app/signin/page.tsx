import { getSession } from "@quickengine/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { resolveDestination } from "../_destination";
import { SignInForm } from "./signin-form";

// Server guard: an already-authenticated visitor never sees the sign-in form —
// they're sent straight to their destination. This is why the browser back
// button can't park a logged-in user back on /signin.
export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ redirect?: string }>;
}) {
	const [session, params] = await Promise.all([
		getSession(await headers()),
		searchParams,
	]);
	if (session) {
		redirect(resolveDestination(params.redirect));
	}
	return (
		<Suspense>
			<SignInForm />
		</Suspense>
	);
}
