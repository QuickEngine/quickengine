import { emailOtp, signIn } from "@quickengine/auth/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AuthButton, AuthError, AuthScreen } from "@/components/auth-screen";
import { CodeInput } from "@/components/code-input";
import { TwoFactorForm } from "@/components/two-factor";
import { describeError } from "@/lib/describe-error";
import { resolveDestination } from "@/lib/destination";
import { clearPendingEmail, getPendingEmail } from "@/lib/pending-email";

/**
 * Enter the six-digit code.
 *
 * ⚠️ A ROUTE, NOT A STEP. This lived inside the sign-in component until
 * 2026-08-10, and that is exactly the wrong shape for it: the visitor leaves for
 * their mail app, iOS discards the background tab, and they return to a page
 * that has reloaded and forgotten the step. The code in their hand is then
 * useless and the only way forward is to start again. A route survives that.
 *
 * The address comes from `sessionStorage`, never the URL — see `pending-email`.
 * With no address there is nothing to verify, so this bounces to sign-in rather
 * than showing a form that cannot work.
 */
function CodePage() {
	const { redirect } = Route.useSearch();
	// Falls back to a placeholder in development ONLY, so this screen can be
	// opened directly for review. The fallback is compiled out of production.
	// The guard above proves this exists; the fallback only satisfies the type.
	const [email] = useState(() => getPendingEmail() ?? "");
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	// ⚠️ Mirrors `allowedAttempts: 3` in the server's `emailOTP` config. Counting
	// here does not enforce anything — the server does that — it exists so the
	// screen can SAY what happened. Without it, a burnt code and a mistyped digit
	// return the same generic message, and people retype the dead code until they
	// give up. If that server value changes, change this with it.
	const [attempts, setAttempts] = useState(0);
	const burnt = attempts >= 3;
	const [twoFactor, setTwoFactor] = useState(false);
	// Sixty seconds, and throttled from the moment the page opens because the
	// code was sent immediately before landing here. Thirty was too tight: mail
	// can take that long to arrive, so the button became available while the
	// first code was still in flight — and a second send invalidates the first,
	// which is how someone ends up typing a code that has just been replaced.
	const [wait, setWait] = useState(60);

	useEffect(() => {
		if (!email) window.location.href = "/signin";
	}, [email]);

	useEffect(() => {
		if (wait <= 0) return;
		const timer = setTimeout(() => setWait((value) => value - 1), 1000);
		return () => clearTimeout(timer);
	}, [wait]);

	const done = () => {
		clearPendingEmail();
		window.location.href = resolveDestination(redirect);
	};

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!email) return;
		setPending(true);
		setError("");
		const result = await signIn.emailOtp({ email, otp: code });
		setPending(false);
		if (result?.error) {
			const used = attempts + 1;
			setAttempts(used);
			// Specific is fine here: reaching this screen already proved they can
			// read that inbox, so nothing is being disclosed.
			setError(
				used >= 3
					? "That code is no longer usable. Request a new one."
					: describeError(result.error, "That code was not right."),
			);
			return;
		}
		// 🔴 A correct code is not necessarily a session — an account with 2FA
		// returns `twoFactorRedirect` instead, and treating that as success sends
		// someone to the dashboard with nothing signed in.
		const data = result?.data;
		if (data && typeof data === "object" && "twoFactorRedirect" in data) {
			setTwoFactor(true);
			return;
		}
		done();
	};

	const resend = async () => {
		if (!email || wait > 0) return;
		setError("");
		setCode("");
		setAttempts(0);
		setWait(60);
		await emailOtp.sendVerificationOtp({ email, type: "sign-in" });
	};

	if (!email) return null;

	if (twoFactor) {
		return (
			<AuthScreen
				title="One more step"
				subtitle="Your account has two-factor turned on."
				swap={{ label: "Sign In", href: "/signin" }}
			>
				<TwoFactorForm onDone={done} />
			</AuthScreen>
		);
	}

	return (
		<AuthScreen
			title="Enter your code"
			subtitle={<>We sent six digits to {email}.</>}
			swap={{ label: "Sign In", href: "/signin" }}
		>
			<form onSubmit={submit} className="flex flex-col gap-5">
				<CodeInput value={code} onChange={setCode} disabled={pending} />

				<AuthError>{error}</AuthError>

				<AuthButton disabled={pending || burnt || code.length < 6}>
					{pending ? "Checking…" : "Continue"}
				</AuthButton>

				<div className="mt-1 flex items-center justify-between">
					{/* Throttled, and it says so. A resend button that silently does
					    nothing for thirty seconds reads as broken, and people click it
					    repeatedly, which is what burns through the attempt limit. */}
					<button
						type="button"
						onClick={resend}
						disabled={wait > 0 && !burnt}
						className="font-body font-light text-[0.8125rem] text-white/45 transition-colors hover:text-white disabled:hover:text-white/45"
					>
						{wait > 0 && !burnt ? `Resend in ${wait}s` : "Resend code"}
					</button>
					<a
						href="/signin"
						className="font-body font-light text-[0.8125rem] text-white/45 transition-colors hover:text-white"
					>
						Use a different email
					</a>
				</div>
			</form>
		</AuthScreen>
	);
}

export const Route = createFileRoute("/code")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	// No address waiting for a code means nobody asked for one. Rendering this
	// screen anyway shows a six-digit input that can never succeed, above the
	// words "we sent a code to" and nothing.
	beforeLoad: ({ search }) => {
		if (!getPendingEmail()) {
			// Carries the original destination through, so someone deep-linked into
			// a flow still lands where they were going once they sign in.
			throw redirect({
				to: "/signin",
				search: {
					// Carries the original destination through, so someone deep-linked
					// into a flow still lands where they were going after signing in.
					redirect: search.redirect,
					signedout: undefined,
					reason: undefined,
				},
			});
		}
	},
	component: CodePage,
});
