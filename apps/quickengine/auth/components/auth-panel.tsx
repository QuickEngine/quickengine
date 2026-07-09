"use client";

import { ArrowLeft, GithubLogo, GoogleLogo } from "@phosphor-icons/react";
import { signIn, signUp } from "@quickengine/auth/client";
import { clientEnv } from "@quickengine/env/client";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

type AuthMode = "sign-in" | "sign-up";

type AuthPanelProps = {
	mode: AuthMode;
};

const defaultRedirect = clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL;

const getErrorMessage = (error: unknown) => {
	if (error instanceof Error) {
		return error.message;
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return error.message;
	}

	return "Something went wrong. Try again in a moment.";
};

export function AuthPanel({ mode }: AuthPanelProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	const callbackURL = useMemo(
		() => searchParams.get("callbackURL") ?? defaultRedirect,
		[searchParams],
	);

	const isSignUp = mode === "sign-up";
	const title = isSignUp ? "Create your account" : "Welcome back";
	const subtitle = isSignUp
		? "Start with one QuickEngine identity for every product."
		: "Continue to your QuickEngine account and connected apps.";

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setIsPending(true);

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "");
		const password = String(formData.get("password") ?? "");
		const name = String(formData.get("name") ?? "");

		try {
			if (isSignUp) {
				const result = await signUp.email({
					name,
					email,
					password,
					callbackURL,
				});

				if (result.error) {
					throw new Error(result.error.message);
				}
			} else {
				const result = await signIn.email({
					email,
					password,
					callbackURL,
				});

				if (result.error) {
					throw new Error(result.error.message);
				}
			}

			router.push(callbackURL);
			router.refresh();
		} catch (caughtError) {
			setError(getErrorMessage(caughtError));
		} finally {
			setIsPending(false);
		}
	};

	const handleSocialSignIn = async (provider: "github" | "google") => {
		setError(null);
		setIsPending(true);

		try {
			const result = await signIn.social({
				provider,
				callbackURL,
			});

			if (result.error) {
				throw new Error(result.error.message);
			}
		} catch (caughtError) {
			setError(getErrorMessage(caughtError));
			setIsPending(false);
		}
	};

	return (
		<main className="grid min-h-dvh bg-[#02040a] px-6 py-6 text-white lg:grid-cols-[1fr_30rem]">
			<section className="hidden min-h-[calc(100dvh-3rem)] flex-col justify-between rounded-lg border border-white/10 bg-white/[0.035] p-8 lg:flex">
				<Link
					className="inline-flex items-center gap-2 text-sm text-white/58 transition hover:text-white"
					href="/"
				>
					<ArrowLeft size={16} />
					QuickEngine Auth
				</Link>
				<div>
					<p className="mb-4 text-sm text-[#80dbff]">Unified access</p>
					<h1 className="m-0 max-w-xl text-balance font-medium text-5xl leading-none tracking-normal">
						One secure doorway for the QuickEngine suite.
					</h1>
					<p className="mt-5 max-w-lg text-base text-white/54 leading-7">
						Accounts start here, then flow into the dashboard, billing, and
						every product we ship.
					</p>
				</div>
			</section>

			<section className="flex min-h-[calc(100dvh-3rem)] items-center justify-center lg:justify-end">
				<div className="w-full max-w-md rounded-lg border border-white/12 bg-white/[0.055] p-6 shadow-2xl shadow-black/30">
					<div>
						<Link
							className="mb-8 inline-flex items-center gap-2 text-sm text-white/58 transition hover:text-white lg:hidden"
							href="/"
						>
							<ArrowLeft size={16} />
							QuickEngine Auth
						</Link>
						<h2 className="m-0 text-2xl font-medium tracking-normal">
							{title}
						</h2>
						<p className="mt-2 mb-0 text-sm text-white/54 leading-6">
							{subtitle}
						</p>
					</div>

					<div className="mt-6 grid gap-3">
						<Button
							className="h-10 border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]"
							disabled={isPending}
							onClick={() => handleSocialSignIn("google")}
							type="button"
							variant="outline"
						>
							<GoogleLogo size={18} weight="bold" />
							Continue with Google
						</Button>
						<Button
							className="h-10 border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]"
							disabled={isPending}
							onClick={() => handleSocialSignIn("github")}
							type="button"
							variant="outline"
						>
							<GithubLogo size={18} weight="bold" />
							Continue with GitHub
						</Button>
					</div>

					<div className="my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-white/36">
						<div className="h-px bg-white/10" />
						<span>Email</span>
						<div className="h-px bg-white/10" />
					</div>

					<form className="grid gap-4" onSubmit={handleSubmit}>
						{isSignUp ? (
							<label
								className="grid gap-2 text-sm text-white/70"
								htmlFor="auth-name"
							>
								Name
								<Input
									autoComplete="name"
									className="h-10 border-white/12 bg-black/24 text-white"
									id="auth-name"
									name="name"
									required
								/>
							</label>
						) : null}
						<label
							className="grid gap-2 text-sm text-white/70"
							htmlFor="auth-email"
						>
							Email
							<Input
								autoComplete="email"
								className="h-10 border-white/12 bg-black/24 text-white"
								id="auth-email"
								name="email"
								required
								type="email"
							/>
						</label>
						<label
							className="grid gap-2 text-sm text-white/70"
							htmlFor="auth-password"
						>
							Password
							<Input
								autoComplete={isSignUp ? "new-password" : "current-password"}
								className="h-10 border-white/12 bg-black/24 text-white"
								id="auth-password"
								minLength={8}
								name="password"
								required
								type="password"
							/>
						</label>

						{error ? (
							<p className="m-0 rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
								{error}
							</p>
						) : null}

						<Button
							className="mt-1 h-10 bg-[#80dbff] text-black hover:bg-[#a1e6ff]"
							disabled={isPending}
							type="submit"
						>
							{isPending
								? "Working..."
								: isSignUp
									? "Create account"
									: "Sign in"}
						</Button>
					</form>

					<p className="mt-6 mb-0 text-center text-sm text-white/50">
						{isSignUp ? "Already have an account?" : "Need an account?"}{" "}
						<Link
							className="font-medium text-white transition hover:text-[#80dbff]"
							href={isSignUp ? "/sign-in" : "/sign-up"}
						>
							{isSignUp ? "Sign in" : "Create one"}
						</Link>
					</p>
				</div>
			</section>
		</main>
	);
}
