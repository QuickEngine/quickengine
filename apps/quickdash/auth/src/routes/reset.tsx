import { resetPassword } from "@quickengine/auth/client";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { type FormEvent, Suspense, useState } from "react";
import {
	AuthButton,
	AuthError,
	AuthScreen,
	authLink,
} from "@/components/auth-screen";
import { PasswordField } from "@/components/password-field";
import { describeError } from "@/lib/describe-error";
import { passwordOk } from "@/lib/validation";

/**
 * Set a new password from an emailed link.
 *
 * ⚠️ This is the SECOND half of the flow. `/forgot` asks for the address and
 * sends the link; this consumes the token it carries. Anything pointing a
 * "forgot password" control here lands on the invalid-link state, because there
 * is nothing to reset without a token.
 *
 * Four states, and all four are reachable in normal use: no token, a rejected
 * token, the form, and done. The two failure states are the ones that get
 * skipped in a redesign and then look like the old theme forever, so they are
 * built on the same primitives as everything else here.
 */
function ResetForm() {
	// Both arrive in the URL: `token` from the email link, `error` if Better Auth
	// rejected the link before we got here.
	const { token: urlToken, error: tokenError } = useSearch({
		strict: false,
	}) as { token?: string; error?: string };
	// Dev-only fallback so the screen can be reviewed without an email round
	// ⚠️ No guard on this route, deliberately. "No token" is one of this screen's
	// four designed states and is reachable in normal use — an old link, a link
	// opened twice, a link mangled by a mail client. Redirecting would replace a
	// screen that explains the problem with one that does not mention it.
	const token = urlToken ?? undefined;

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		// ⚠️ Strength BEFORE match. Told "those don't match" first, someone retypes
		// the same weak password into both boxes and only then learns it was never
		// going to be accepted — two failures to fix what was always one problem.
		if (!passwordOk(password)) {
			setError("That password does not meet all the requirements below.");
			return;
		}
		if (password !== confirm) {
			setError("Those passwords don't match.");
			return;
		}
		setPending(true);
		setError("");
		const { error: resetError } = await resetPassword({
			newPassword: password,
			token: token ?? "",
		});
		setPending(false);
		if (resetError) {
			setError(describeError(resetError, "Could not reset your password."));
			return;
		}
		setDone(true);
	};

	if (done) {
		return (
			<AuthScreen
				title="Password updated"
				subtitle="You can sign in with it now."
				swap={{ label: "Sign In", href: "/signin" }}
			>
				<AuthButton href="/signin">Continue to sign in</AuthButton>
			</AuthScreen>
		);
	}

	// A bad or expired link, or someone opened the page directly.
	if (tokenError || !token) {
		return (
			<AuthScreen
				title="That link has expired"
				subtitle="Reset links are single use."
				swap={{ label: "Sign In", href: "/signin" }}
			>
				<div className="flex flex-col gap-4">
					<AuthButton href="/forgot">Send a new link</AuthButton>
					<p className="text-center font-body font-light text-[0.8125rem] text-white/50">
						Remembered it?{" "}
						<a href="/signin" className={authLink}>
							Sign In
						</a>
					</p>
				</div>
			</AuthScreen>
		);
	}

	const ready = password.length > 0 && confirm.length > 0;

	return (
		<AuthScreen
			title="Set a new password"
			subtitle="Pick something you have not used before."
			swap={{ label: "Sign In", href: "/signin" }}
		>
			<form onSubmit={onSubmit} className="flex flex-col gap-3">
				<PasswordField
					strength
					value={password}
					onChange={setPassword}
					placeholder="New password"
					label="New password"
				/>
				<PasswordField
					value={confirm}
					onChange={setConfirm}
					placeholder="Confirm new password"
					label="Confirm new password"
				/>

				<AuthError>{error}</AuthError>

				<AuthButton disabled={pending || !ready}>
					{pending ? "Updating…" : "Update password"}
				</AuthButton>
			</form>
		</AuthScreen>
	);
}

function Page() {
	return (
		<Suspense>
			<ResetForm />
		</Suspense>
	);
}

export const Route = createFileRoute("/reset")({
	component: Page,
});
