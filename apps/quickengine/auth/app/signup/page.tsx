import { getSession } from "@quickengine/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { resolveDestination } from "../_destination";
import { SignUpForm } from "./signup-form";

// Server guard: an already-authenticated visitor is redirected to their
// destination instead of seeing the sign-up form (see signin/page.tsx).
export default async function SignUpPage({
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
			<SignUpForm />
		</Suspense>
	);
}
