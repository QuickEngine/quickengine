"use client";

import { signIn, signUp } from "@quickengine/auth/client";
import { type FormEvent, useState } from "react";
import {
	AuthShell,
	Divider,
	field,
	GithubIcon,
	GoogleIcon,
	primaryButton,
	socialButton,
	textLink,
} from "../_auth-ui";
import { useAuthDestination } from "../_use-auth-destination";

export function SignUpForm() {
	const destination = useAuthDestination();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const social = (provider: "google" | "github") =>
		signIn.social({ provider, callbackURL: destination });

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError("");
		const { error: signUpError } = await signUp.email({
			name,
			email,
			password,
			callbackURL: destination,
		});
		setPending(false);
		if (signUpError) {
			setError(signUpError.message ?? "Something went wrong. Try again.");
			return;
		}
		setSent(true);
	};

	return (
		<AuthShell>
			{sent ? (
				<div className="text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Check your email
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						We sent a verification link to{" "}
						<span className="text-foreground">{email}</span>. Click it to
						activate your account.
					</p>
				</div>
			) : (
				<>
					<div className="mb-8 text-center">
						<h1 className="font-medium text-[22px] text-foreground tracking-tight">
							Create your account
						</h1>
						<p className="mt-2 text-[14px] text-muted-foreground">
							Run your business from one backend.
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
					</div>

					<Divider />

					<form onSubmit={onSubmit} className="flex flex-col gap-3">
						<input
							className={field}
							placeholder="Full name"
							autoComplete="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
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
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
						{error && <p className="text-[13px] text-red-400">{error}</p>}
						<button
							type="submit"
							disabled={pending}
							className={`mt-1 ${primaryButton}`}
						>
							{pending ? "Creating account…" : "Create account"}
						</button>
					</form>

					<p className="mt-6 text-center text-[13px] text-muted-foreground">
						Already have an account?{" "}
						<a href="/signin" className={textLink}>
							Sign in
						</a>
					</p>
				</>
			)}
		</AuthShell>
	);
}
