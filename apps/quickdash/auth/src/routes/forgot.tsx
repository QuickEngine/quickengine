import { requestPasswordReset } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
	AuthButton,
	AuthScreen,
	authField,
	authLink,
} from "@/components/auth-screen";
import { env } from "@/lib/env";

/**
 * Ask for a password reset link.
 *
 * ⚠️ This screen did not exist. `/reset` reads a `token` from the email link and
 * is the SET A NEW PASSWORD half — so the "Forgot password?" control had nowhere
 * legitimate to point, and password recovery was reachable only by receiving an
 * email nothing on the site could trigger.
 *
 * 🔴 The confirmation is deliberately identical whether or not the address is
 * registered. Saying "no account with that email" turns this form into an
 * oracle for testing which addresses exist — worse here than on sign-in, because
 * this one can be submitted repeatedly without any rate limit the user notices.
 */
function ForgotPage() {
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		// The result is ignored on purpose — see the note above. Both outcomes show
		// the same screen.
		await requestPasswordReset({
			email,
			redirectTo: `${env.VITE_AUTH_URL}/reset`,
		});
		setPending(false);
		setSent(true);
	};

	if (sent) {
		return (
			<AuthScreen
				title="Check your email"
				subtitle={<>If an account exists for {email}, a link is on its way.</>}
				swap={{ label: "Sign In", href: "/signin" }}
			>
				<div className="flex flex-col items-center gap-4">
					<button
						type="button"
						onClick={() => setSent(false)}
						className="font-body font-light text-[0.8125rem] text-white/45 transition-colors hover:text-white"
					>
						Use a different email
					</button>
				</div>
			</AuthScreen>
		);
	}

	return (
		<AuthScreen
			title="Reset your password"
			subtitle="We'll email you a link."
			swap={{ label: "Sign In", href: "/signin" }}
		>
			<form onSubmit={submit} className="flex flex-col gap-3">
				<input
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="you@company.com"
					aria-label="Email address"
					className={authField}
				/>
				<AuthButton disabled={pending || !email}>
					{pending ? "Sending…" : "Send reset link"}
				</AuthButton>

				<p className="mt-4 text-center font-body font-light text-[0.8125rem] text-white/50">
					Remembered it?{" "}
					<a href="/signin" className={authLink}>
						Sign In
					</a>
				</p>
			</form>
		</AuthScreen>
	);
}

export const Route = createFileRoute("/forgot")({
	component: ForgotPage,
});
