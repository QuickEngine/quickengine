import { signIn } from "@quickengine/auth/client";
import { Logo } from "@quickengine/ui";
import { type FormEvent, useState } from "react";
import { GithubIcon, GoogleIcon } from "@/components/auth-ui";
import { env } from "@/lib/env";
import { useAuthDestination } from "@/lib/use-auth-destination";

const WEB_URL = env.VITE_WEB_URL;

/**
 * Sign in, small and centred.
 *
 * ⚠️ A NEW layout, not a replacement for the logic. The full multi-step flow —
 * password, magic link, 2FA, recovery codes — is untouched in `signin-form.tsx`.
 * This panel wires the same `@quickengine/auth/client` calls for the paths it
 * shows; the remaining steps get laid in as we build them.
 *
 * Order is deliberate: the two providers most people already have, then passkey
 * for anyone who set one up, then email. Email is last because it is the slowest
 * path — a round trip and a second screen.
 */
export function SignInPanel() {
	const destination = useAuthDestination();
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState("");

	const social = (provider: "google" | "github") => {
		setError("");
		setPending(provider);
		signIn.social({ provider, callbackURL: destination });
	};

	const withPasskey = async () => {
		setError("");
		setPending("passkey");
		const result = await signIn.passkey();
		setPending(null);
		if (result?.error) {
			setError(result.error.message ?? "That passkey did not work.");
			return;
		}
		window.location.href = destination;
	};

	const onContinue = (event: FormEvent) => {
		event.preventDefault();
		if (!email) return;
		setError("");
		// Next step lands here — password / magic link, from `signin-form.tsx`.
	};

	const control =
		"btn h-8 rounded-lg font-body font-[450] text-[12px] disabled:opacity-55";
	const ghost = `${control} btn-secondary inline-flex items-center justify-center gap-2 bg-field text-ink`;

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

			{/* A greeting, not a product name — the left panel already said where you
			    are. "Welcome back" also quietly assumes you have an account, which is
			    right on the sign-in page. */}
			<h1 className="rise rise-1 mt-5 text-center font-body text-[16px] text-ink tracking-[-0.02em]">
				Welcome back
			</h1>

			<p className="rise rise-1 mt-4 text-center font-body text-[12px] text-dim">
				Don&rsquo;t have an account?{" "}
				<a
					href="/signup"
					className="text-ink underline decoration-edge underline-offset-[3px] transition-colors hover:decoration-ink"
				>
					Get started
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

			<button
				type="button"
				onClick={withPasskey}
				disabled={pending !== null}
				className={`${ghost} mt-1.5 w-full`}
			>
				{pending === "passkey"
					? "Waiting for passkey…"
					: "Sign in with passkey"}
			</button>

			<div className="my-4 flex items-center gap-2.5">
				<span className="h-px flex-1 bg-edge" />
				<span className="font-body text-[10px] text-dim tracking-[0.08em]">
					OR
				</span>
				<span className="h-px flex-1 bg-edge" />
			</div>

			<form onSubmit={onContinue} className="rise rise-3">
				{/* Placeholder carries the label. A visible label above a single
				    obvious field is redundant here, but the input still needs an
				    accessible name, hence `aria-label`. */}
				<input
					type="email"
					name="email"
					aria-label="Work email"
					autoComplete="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="Enter your work email…"
					className="h-8 w-full rounded-lg border border-edge bg-field px-2.5 font-body text-[12px] text-ink outline-none transition-colors placeholder:text-dim focus:border-signal"
				/>

				<button
					type="submit"
					disabled={pending !== null || !email}
					className={`${control} btn-primary mt-1.5 inline-flex w-full items-center justify-center bg-invert text-on-invert`}
				>
					Continue
				</button>
			</form>

			{/* Directly under the button that accepts it — legal pinned to the bottom
			    of the page read as detached from the form it applies to. */}
			<p className="-mx-10 mt-5 whitespace-nowrap text-center font-body text-[11px] text-dim">
				<span>
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
