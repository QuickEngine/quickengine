"use client";

import { sendVerificationEmail } from "@quickengine/auth/client";
import { useQueryState } from "nuqs";
import { type FormEvent, Suspense, useState } from "react";
import { AuthShell, field, primaryButton, textLink } from "../_auth-ui";

function VerifyEmail() {
	// Better Auth verifies the token on its API route, then redirects here — with
	// `?error=...` only when something went wrong. No error means it worked.
	const [verifyError] = useQueryState("error");
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
			setError(sendError.message ?? "Could not send the email.");
			return;
		}
		setResent(true);
	};

	if (!verifyError) {
		return (
			<AuthShell>
				<div className="text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Email verified
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Your email is confirmed. Let's secure your account.
					</p>
					{/* Fresh email/password signups flow through the optional security
					    step next. (OAuth never lands here — it doesn't verify email.) */}
					<a href="/secure" className={`${primaryButton} mt-6 w-full`}>
						Continue
					</a>
				</div>
			</AuthShell>
		);
	}

	if (resent) {
		return (
			<AuthShell>
				<div className="text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Check your email
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						We sent a fresh verification link to{" "}
						<span className="text-foreground">{email}</span>.
					</p>
				</div>
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<div className="mb-8 text-center">
				<h1 className="font-medium text-[22px] text-foreground tracking-tight">
					Verification failed
				</h1>
				<p className="mt-2 text-[14px] text-muted-foreground">
					That link has expired or already been used. Enter your email and we'll
					send a new one.
				</p>
			</div>
			<form onSubmit={resend} className="flex flex-col gap-3">
				<input
					className={field}
					type="email"
					placeholder="Email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
				/>
				{error && <p className="text-[13px] text-red-400">{error}</p>}
				<button type="submit" disabled={pending} className={primaryButton}>
					{pending ? "Sending…" : "Resend verification"}
				</button>
			</form>
			<p className="mt-6 text-center text-[13px] text-muted-foreground">
				<a href="/signin" className={textLink}>
					Back to sign in
				</a>
			</p>
		</AuthShell>
	);
}

export default function Page() {
	return (
		<Suspense>
			<VerifyEmail />
		</Suspense>
	);
}
