import { sendVerificationEmail } from "@quickengine/auth/client";
import { createFileRoute, redirect, useSearch } from "@tanstack/react-router";
import { type FormEvent, Suspense, useState } from "react";
import {
	AuthButton,
	AuthError,
	AuthScreen,
	authField,
	authLink,
} from "@/components/auth-screen";
import { describeError } from "@/lib/describe-error";
import { hasSession } from "@/lib/guards";

/**
 * Where the email verification link lands.
 *
 * ⚠️ The token is NOT verified here. Better Auth checks it on its own API route
 * and then redirects to this page — with `?error=…` only when something went
 * wrong. So the absence of an error IS the success signal, which is why this
 * screen shows "verified" by default rather than doing any work.
 *
 * That inversion is worth knowing before anyone "fixes" it: adding a token check
 * here would double-consume a single-use token and turn every successful
 * verification into a failure.
 *
 * Three states, all reachable: verified, the link failed, and a fresh link sent.
 */
function VerifyEmail() {
	const { error: verifyError } = useSearch({ strict: false }) as {
		error?: string;
	};
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [resent, setResent] = useState(false);
	const [error, setError] = useState("");

	const resend = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError("");
		const { error: sendError } = await sendVerificationEmail({
			email,
			callbackURL: `${window.location.origin}/verify`,
		});
		setPending(false);
		if (sendError) {
			setError(describeError(sendError, "Could not send the email."));
			return;
		}
		setResent(true);
	};

	if (!verifyError) {
		return (
			<AuthScreen title="Email verified" subtitle="Your address is confirmed.">
				{/* Email and password signups continue to the optional security step.
				    OAuth never lands here, those providers have already verified the
				    address, so there is nothing for this page to confirm. */}
				<AuthButton href="/secure">Continue</AuthButton>
			</AuthScreen>
		);
	}

	if (resent) {
		return (
			<AuthScreen
				title="Check your email"
				swap={{ label: "Sign In", href: "/signin" }}
			></AuthScreen>
		);
	}

	return (
		<AuthScreen
			title="That link has expired"
			subtitle="Verification links are single use."
			swap={{ label: "Sign In", href: "/signin" }}
		>
			<form onSubmit={resend} className="flex flex-col gap-3">
				<input
					className={authField}
					type="email"
					placeholder="you@company.com"
					aria-label="Email address"
					autoComplete="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					required
				/>

				<AuthError>{error}</AuthError>

				<AuthButton disabled={pending || !email}>
					{pending ? "Sending…" : "Send a new link"}
				</AuthButton>

				<p className="mt-4 text-center font-body font-light text-[0.8125rem] text-white/50">
					Wrong account?{" "}
					<a href="/signin" className={authLink}>
						Sign In
					</a>
				</p>
			</form>
		</AuthScreen>
	);
}

function Page() {
	return (
		<Suspense>
			<VerifyEmail />
		</Suspense>
	);
}

export const Route = createFileRoute("/verify")({
	/**
	 * Two legitimate ways to be here, and nothing else.
	 *
	 * ⚠️ `?error=` FIRST. A rejected or expired link is precisely the case where
	 * there is no session, so checking the session first would bounce the person
	 * whose problem this screen exists to explain.
	 *
	 * Otherwise a session is required, which is sound because the server sets
	 * `autoSignInAfterVerification: true` — succeeding at verification signs you
	 * in, so anyone who genuinely arrived here has one. Typing the address
	 * directly used to render "Email verified" to somebody who had verified
	 * nothing, which is worse than useless: it is wrong.
	 */
	beforeLoad: async ({ location }) => {
		if (new URLSearchParams(location.searchStr).has("error")) return;
		if (!(await hasSession()))
			throw redirect({
				to: "/signin",
				search: {
					// ⚠️ Every key stated. `/signin` declares `validateSearch`, so its
					// search shape is required in full here even though all three are
					// optional at runtime — `{}` does not satisfy it.
					redirect: undefined,
					signedout: undefined,
					reason: undefined,
				},
			});
	},
	component: Page,
});
