import { signIn } from "@quickengine/auth/client";
import { Logo } from "@quickengine/ui";
import { type FormEvent, useState } from "react";
import { GithubIcon, GoogleIcon } from "@/components/auth-ui";
import { env } from "@/lib/env";
import { useAuthDestination } from "@/lib/use-auth-destination";

const WEB_URL = env.VITE_WEB_URL;

/**
 * Create an account. Same layout as sign-in, deliberately.
 *
 * ⚠️ A NEW layout, not a replacement for the logic. The working flow — name,
 * email, password, `signUp.email` and the "check your email" state — is
 * untouched in `signup-form.tsx` and gets laid in as the next step is designed.
 *
 * Identical to `SignInPanel` in structure and different only in words. That is
 * the point: someone who lands on the wrong one should be able to switch without
 * relearning the screen, and only the copy should tell them which they are on.
 *
 * No passkey here. A passkey proves you are someone who already registered one,
 * so it is a sign-in method, not a way to create an account.
 */
export function SignUpPanel() {
	const destination = useAuthDestination();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState("");

	const social = (provider: "google" | "github") => {
		setError("");
		setPending(provider);
		signIn.social({ provider, callbackURL: destination });
	};

	const onContinue = (event: FormEvent) => {
		event.preventDefault();
		if (!name || !email) return;
		setError("");
		// Next step lands here — password, then `signUp.email({ name, email, … })`
		// from `signup-form.tsx`, which already takes a single `name`.
	};

	const control =
		"btn h-8 rounded-lg font-body font-[450] text-[12px] disabled:opacity-55";
	const ghost = `${control} btn-secondary inline-flex items-center justify-center gap-2 bg-field text-ink`;
	const input =
		"h-8 w-full rounded-lg border border-edge bg-field px-2.5 font-body text-[12px] text-ink outline-none transition-colors placeholder:text-dim focus:border-signal";

	return (
		<div className="w-[16.5rem] max-w-full">
			{/* Small. It marks the form as ours without becoming the first thing you
			    deal with — the heading directly beneath is what you came to read. */}
			<div className="rise flex items-center justify-center gap-2.5">
				<Logo className="h-7 w-auto text-ink" />
				<span className="font-display text-[19px] text-ink leading-none tracking-[-0.01em]">
					QuickEngine
				</span>
			</div>

			{/* Sign-in says "welcome back", which assumes an account. This says the
			    opposite thing to the opposite person. */}
			<h1 className="rise rise-1 mt-5 text-center font-body text-[16px] text-ink tracking-[-0.02em]">
				Create your account
			</h1>

			<p className="rise rise-1 mt-4 text-center font-body text-[12px] text-dim">
				Already have an account?{" "}
				<a
					href="/signin"
					className="text-ink underline decoration-edge underline-offset-[3px] transition-colors hover:decoration-ink"
				>
					Sign in
				</a>
			</p>

			<div className="rise rise-2 mt-6 grid grid-cols-2 gap-1.5">
				<button
					type="button"
					onClick={() => social("google")}
					disabled={pending !== null}
					className={ghost}
				>
					<GoogleIcon />
					Google
				</button>
				<button
					type="button"
					onClick={() => social("github")}
					disabled={pending !== null}
					className={ghost}
				>
					<GithubIcon />
					GitHub
				</button>
			</div>

			<div className="my-4 flex items-center gap-2.5">
				<span className="h-px flex-1 bg-edge" />
				<span className="font-body text-[10px] text-dim tracking-[0.08em]">
					OR
				</span>
				<span className="h-px flex-1 bg-edge" />
			</div>

			<form onSubmit={onContinue} className="rise rise-3">
				{/* One field, and `autoComplete="name"` rather than the given/family
				    pair — which also matches `signUp.email`, since Better Auth stores a
				    single `name` and splitting it here would only mean joining it back
				    together on submit. */}
				<input
					type="text"
					name="name"
					aria-label="Full name"
					autoComplete="name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Full name"
					className={input}
				/>

				<input
					type="email"
					name="email"
					aria-label="Work email"
					autoComplete="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="Enter your work email…"
					className={`${input} mt-1.5`}
				/>

				<button
					type="submit"
					disabled={pending !== null || !name || !email}
					className={`${control} btn-primary mt-1.5 inline-flex w-full items-center justify-center bg-invert text-on-invert`}
				>
					Continue
				</button>
			</form>

			{/* The consent sentence belongs HERE and not on sign-in. Creating the
			    account is the moment the agreement forms; signing in is someone who
			    already agreed, so there the same links are reference rather than
			    consent. Directly under the button that accepts it, too — legal pinned
			    to the bottom of the page reads as detached from the form.

			    Two lines, broken after "our" — the sentence on top, the two documents
			    together beneath. `-mx-10` gives the second line room to hold on one
			    line rather than breaking again between the links. */}
			<p className="-mx-10 mt-5 text-center font-body text-[11px] text-dim leading-relaxed">
				By signing up you agree to our
				<span className="block whitespace-nowrap">
					<a
						href={`${WEB_URL}/terms`}
						className="text-ink underline decoration-edge underline-offset-[3px] transition-colors hover:decoration-ink"
					>
						Terms of Service
					</a>
					<span className="px-1.5">&bull;</span>
					<a
						href={`${WEB_URL}/privacy`}
						className="text-ink underline decoration-edge underline-offset-[3px] transition-colors hover:decoration-ink"
					>
						Privacy Policy
					</a>
				</span>
			</p>

			{error ? (
				<p role="alert" className="mt-3.5 text-center text-[11px] text-dim">
					{error}
				</p>
			) : null}
		</div>
	);
}
