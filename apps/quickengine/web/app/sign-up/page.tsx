"use client";

import { faGithub, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signUp } from "@quickengine/auth/client";
import Image from "next/image";
import { type FormEvent, useState } from "react";

const field =
	"h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-white/25 focus:bg-white/[0.05]";

export default function SignUpPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const social = (provider: "google" | "github") =>
		signIn.social({ provider, callbackURL: `${window.location.origin}/` });

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError("");
		const { error: signUpError } = await signUp.email({
			name,
			email,
			password,
			callbackURL: `${window.location.origin}/`,
		});
		setPending(false);
		if (signUpError) {
			setError(signUpError.message ?? "Something went wrong. Try again.");
			return;
		}
		setSent(true);
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
								className="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-white/25"
							>
								<FontAwesomeIcon icon={faGoogle} className="h-4 w-4" />
								Continue with Google
							</button>
							<button
								type="button"
								onClick={() => social("github")}
								className="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-white/25"
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
								className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-white font-medium text-[14px] text-black outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-60"
							>
								{pending ? "Creating account…" : "Create account"}
							</button>
						</form>

						<p className="mt-6 text-center text-[13px] text-muted-foreground">
							Already have an account?{" "}
							<a
								href="/sign-in"
								className="text-foreground underline-offset-4 hover:underline"
							>
								Sign in
							</a>
						</p>
					</>
				)}
			</div>
		</main>
	);
}
