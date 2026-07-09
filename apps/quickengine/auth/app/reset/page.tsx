"use client";

import { resetPassword } from "@quickengine/auth/client";
import { useQueryState } from "nuqs";
import { type FormEvent, Suspense, useState } from "react";
import { AuthShell, field, primaryButton, textLink } from "../_auth-ui";

function ResetForm() {
	// Both arrive in the URL: `token` from the email link, `error` if Better Auth
	// rejected the link before we got here.
	const [token] = useQueryState("token");
	const [tokenError] = useQueryState("error");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
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
			setError(resetError.message ?? "Could not reset your password.");
			return;
		}
		setDone(true);
	};

	if (done) {
		return (
			<AuthShell>
				<div className="text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Password updated
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Your password has been changed. You can sign in with it now.
					</p>
					<a href="/signin" className={`${primaryButton} mt-6 w-full`}>
						Continue to sign in
					</a>
				</div>
			</AuthShell>
		);
	}

	// Bad/expired link, or someone opened the page directly without a token.
	if (tokenError || !token) {
		return (
			<AuthShell>
				<div className="text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Reset link invalid
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						{tokenError
							? "This reset link has expired or already been used."
							: "Open this page from the reset link in your email."}
					</p>
					<a href="/signin" className="mt-6 inline-block">
						<span className={textLink}>Back to sign in</span>
					</a>
				</div>
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<div className="mb-8 text-center">
				<h1 className="font-medium text-[22px] text-foreground tracking-tight">
					Set a new password
				</h1>
				<p className="mt-2 text-[14px] text-muted-foreground">
					Choose a new password for your account.
				</p>
			</div>
			<form onSubmit={onSubmit} className="flex flex-col gap-3">
				<input
					className={field}
					type="password"
					placeholder="New password"
					autoComplete="new-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
				/>
				<input
					className={field}
					type="password"
					placeholder="Confirm new password"
					autoComplete="new-password"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
					required
				/>
				{error && <p className="text-[13px] text-red-400">{error}</p>}
				<button
					type="submit"
					disabled={pending}
					className={`mt-1 ${primaryButton}`}
				>
					{pending ? "Updating…" : "Update password"}
				</button>
			</form>
		</AuthShell>
	);
}

export default function Page() {
	return (
		<Suspense>
			<ResetForm />
		</Suspense>
	);
}
