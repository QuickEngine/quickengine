"use client";

import {
	requestPasswordReset,
	signIn,
	twoFactor,
} from "@quickengine/auth/client";
import { type FormEvent, useState } from "react";
import {
	AuthShell,
	Divider,
	field,
	GithubIcon,
	GoogleIcon,
	primaryButton,
	socialButton,
	subtleButton,
	textLink,
} from "../_auth-ui";
import { useAuthDestination } from "../_use-auth-destination";

type Step = "credentials" | "twoFactor" | "sent";

export function SignInForm() {
	const destination = useAuthDestination();
	const finish = () => {
		window.location.href = destination;
	};

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [step, setStep] = useState<Step>("credentials");
	const [sentMessage, setSentMessage] = useState("");
	const [useRecovery, setUseRecovery] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	const social = (provider: "google" | "github") =>
		signIn.social({ provider, callbackURL: destination });

	const withPasskey = async () => {
		setError("");
		const res = await signIn.passkey();
		if (res?.error) {
			setError(res.error.message ?? "Passkey sign-in failed.");
			return;
		}
		finish();
	};

	const magicLink = async () => {
		if (!email) {
			setError("Enter your email first, then request a link.");
			return;
		}
		setPending(true);
		setError("");
		const { error: mlError } = await signIn.magicLink({
			email,
			callbackURL: destination,
		});
		setPending(false);
		if (mlError) {
			setError(mlError.message ?? "Could not send the link.");
			return;
		}
		setSentMessage(`We emailed a sign-in link to ${email}.`);
		setStep("sent");
	};

	const forgotPassword = async () => {
		if (!email) {
			setError("Enter your email first, then reset your password.");
			return;
		}
		setPending(true);
		setError("");
		const { error: prError } = await requestPasswordReset({
			email,
			redirectTo: `${window.location.origin}/reset`,
		});
		setPending(false);
		if (prError) {
			setError(prError.message ?? "Could not send the reset email.");
			return;
		}
		setSentMessage(
			`If an account exists for ${email}, a reset link is on its way.`,
		);
		setStep("sent");
	};

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError("");
		const { data, error: signInError } = await signIn.email({
			email,
			password,
		});
		setPending(false);
		if (signInError) {
			setError(signInError.message ?? "Incorrect email or password.");
			return;
		}
		if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
			setStep("twoFactor");
			return;
		}
		finish();
	};

	const onVerify = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError("");
		const { error: verifyError } = useRecovery
			? await twoFactor.verifyBackupCode({ code })
			: await twoFactor.verifyTotp({ code });
		setPending(false);
		if (verifyError) {
			setError(verifyError.message ?? "Invalid code. Try again.");
			return;
		}
		finish();
	};

	if (step === "sent") {
		return (
			<AuthShell>
				<div className="text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Check your email
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						{sentMessage}
					</p>
				</div>
			</AuthShell>
		);
	}

	if (step === "twoFactor") {
		return (
			<AuthShell>
				<div className="mb-8 text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Two-factor authentication
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground">
						{useRecovery
							? "Enter one of your recovery codes."
							: "Enter the code from your authenticator app."}
					</p>
				</div>
				<form onSubmit={onVerify} className="flex flex-col gap-3">
					<input
						className={field}
						placeholder={useRecovery ? "Recovery code" : "123456"}
						autoComplete="one-time-code"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						// biome-ignore lint/a11y/noAutofocus: single field on this step
						autoFocus
						required
					/>
					{error && <p className="text-[13px] text-red-400">{error}</p>}
					<button type="submit" disabled={pending} className={primaryButton}>
						{pending ? "Verifying…" : "Verify"}
					</button>
				</form>
				<button
					type="button"
					onClick={() => {
						setUseRecovery((v) => !v);
						setCode("");
						setError("");
					}}
					className="mt-6 w-full text-center text-[13px] text-muted-foreground transition-colors hover:text-foreground"
				>
					{useRecovery
						? "Use your authenticator app instead"
						: "Use a recovery code instead"}
				</button>
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<div className="mb-8 text-center">
				<h1 className="font-medium text-[22px] text-foreground tracking-tight">
					Welcome back
				</h1>
				<p className="mt-2 text-[14px] text-muted-foreground">
					Sign in to your QuickEngine account.
				</p>
			</div>

			<div className="flex flex-col gap-2.5">
				<button
					type="button"
					onClick={() => social("google")}
					className={socialButton}
				>
					<GoogleIcon />
					Continue with Google
				</button>
				<button
					type="button"
					onClick={() => social("github")}
					className={socialButton}
				>
					<GithubIcon />
					Continue with GitHub
				</button>
				<button type="button" onClick={withPasskey} className={subtleButton}>
					Sign in with a passkey
				</button>
			</div>

			<Divider />

			<form onSubmit={onSubmit} className="flex flex-col gap-3">
				<input
					className={field}
					type="email"
					placeholder="Email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
				/>
				<input
					className={field}
					type="password"
					placeholder="Password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
				/>
				{error && <p className="text-[13px] text-red-400">{error}</p>}
				<button type="submit" disabled={pending} className={primaryButton}>
					{pending ? "Signing in…" : "Sign in"}
				</button>
			</form>

			<div className="mt-4 flex items-center justify-between">
				<button type="button" onClick={magicLink} className={textLink}>
					Email me a link
				</button>
				<button type="button" onClick={forgotPassword} className={textLink}>
					Forgot password?
				</button>
			</div>

			<p className="mt-6 text-center text-[13px] text-muted-foreground">
				Don't have an account?{" "}
				<a href="/signup" className={textLink}>
					Get started
				</a>
			</p>
		</AuthShell>
	);
}
