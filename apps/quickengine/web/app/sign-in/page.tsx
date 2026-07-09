"use client";

import { faGithub, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, twoFactor } from "@quickengine/auth/client";
import Image from "next/image";
import { type FormEvent, useState } from "react";

const field =
	"h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-white/25 focus:bg-white/[0.05]";

const socialButton =
	"inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-white/25";

const primaryButton =
	"mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-white font-medium text-[14px] text-black outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-60";

const done = () => {
	// TODO: land on the account console once it exists (priority 3).
	window.location.href = "/";
};

export default function SignInPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [step, setStep] = useState<"credentials" | "twoFactor">("credentials");
	const [useRecovery, setUseRecovery] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	const social = (provider: "google" | "github") =>
		signIn.social({ provider, callbackURL: `${window.location.origin}/` });

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
		done();
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
		done();
	};

	return (
		<main className="flex min-h-dvh items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm">
				<a href="/" className="mb-10 flex justify-center">
					<Image
						src="/logo.svg"
						alt="QuickEngine"
						width={250}
						height={250}
						priority
						className="h-7 w-7"
					/>
				</a>

				{step === "twoFactor" ? (
					<>
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
								// biome-ignore lint/a11y/noAutofocus: focus the only field on this step
								autoFocus
								required
							/>
							{error && <p className="text-[13px] text-red-400">{error}</p>}
							<button
								type="submit"
								disabled={pending}
								className={primaryButton}
							>
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
					</>
				) : (
					<>
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
								<FontAwesomeIcon icon={faGoogle} className="h-4 w-4" />
								Continue with Google
							</button>
							<button
								type="button"
								onClick={() => social("github")}
								className={socialButton}
							>
								<FontAwesomeIcon icon={faGithub} className="h-4 w-4" />
								Continue with GitHub
							</button>
						</div>

						<div className="my-6 flex items-center gap-4">
							<span className="h-px flex-1 bg-white/10" />
							<span className="text-[12px] text-muted-foreground">or</span>
							<span className="h-px flex-1 bg-white/10" />
						</div>

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
							<button
								type="submit"
								disabled={pending}
								className={primaryButton}
							>
								{pending ? "Signing in…" : "Sign in"}
							</button>
						</form>

						<p className="mt-6 text-center text-[13px] text-muted-foreground">
							Don't have an account?{" "}
							<a
								href="/sign-up"
								className="text-foreground underline-offset-4 hover:underline"
							>
								Get started
							</a>
						</p>
					</>
				)}
			</div>
		</main>
	);
}
