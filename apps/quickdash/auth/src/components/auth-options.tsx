import {
	EnvelopeSimpleIcon,
	FingerprintIcon,
	LockSimpleIcon,
} from "@phosphor-icons/react";
import { emailOtp, signIn } from "@quickengine/auth/client";
import { ICE } from "@quickengine/ui";
import { type FormEvent, type ReactNode, useState } from "react";
import { AuthError, authOptionRow } from "@/components/auth-screen";
import { GithubIcon, GoogleIcon } from "@/components/auth-ui";
import { PasswordField } from "@/components/password-field";
import { TwoFactorForm } from "@/components/two-factor";
import { describeError } from "@/lib/describe-error";
import { resolveDestination } from "@/lib/destination";
import { getLastMethod, type Method, setLastMethod } from "@/lib/last-method";
import { setPendingEmail } from "@/lib/pending-email";
import { emailProblem } from "@/lib/validation";

/**
 * The whole entry surface: email code, Google, GitHub, passkey.
 *
 * ⚠️ EVERY OPTION IS THE SAME BUTTON. That uniformity is the design, not
 * laziness — the moment one method is a filled pill and the rest are outlined,
 * the page is telling people which identity they ought to have, and whichever
 * one they actually own feels like the lesser path. Rows are ordered instead:
 * position carries the recommendation, styling stays neutral.
 *
 * The order is IDENTICAL on sign-in and sign-up. Email leads on both — it is the
 * one method everybody has, and a page that reorders itself between two screens
 * makes people hunt for the option they just used.
 *
 * ⚠️ A CODE, NOT A MAGIC LINK — the reason is mobile. A link opens in the
 * device's DEFAULT browser, very often not the one the visitor started in, so
 * the session is created somewhere they are not looking while the original tab
 * sits unauthenticated forever. A code stays in the tab that asked for it.
 * `magicLink` remains wired server-side for other flows; this is the one on the
 * page.
 *
 * SSO is absent on purpose — it is not built, and an option that leads nowhere
 * is worse than one that is missing. It belongs in the enterprise sweep.
 */
function Row({
	children,
	icon,
	onClick,
	type = "button",
	disabled,
	last,
}: {
	children: ReactNode;
	icon: ReactNode;
	onClick?: () => void;
	type?: "button" | "submit";
	disabled?: boolean;
	/** Marks the method this browser used last. */
	last?: boolean;
}) {
	return (
		<button
			type={type === "submit" ? "submit" : "button"}
			onClick={onClick}
			disabled={disabled}
			// A filled surface rather than an outline: these sit on a moving
			// gradient, and an outlined control is only legible for about half of
			// the wave's cycle.
			style={{ borderColor: `${ICE}1F`, color: ICE }}
			className={authOptionRow}
		>
			{/* Fixed-width box so a wide glyph and a narrow one occupy the same space.
			    Without it each row's group is a different width for reasons that have
			    nothing to do with its label, and the centring looks unsteady down the
			    column even though every row is genuinely centred. */}
			<span className="flex w-5 shrink-0 justify-center">{icon}</span>
			<span>{children}</span>
			{/* Pinned to the top-right corner, straddling the border. A badge on the
			    edge of a control reads as a label ABOUT that control; the same words
			    inside the row read as part of it, and start competing with the label
			    for what the button says. */}
			{last ? (
				<span
					style={{ backgroundColor: ICE, color: "#000000" }}
					className="-top-2 absolute end-4 rounded-full px-2.5 py-[3px] font-body font-normal text-[10px] uppercase tracking-[0.08em]"
				>
					Last used
				</span>
			) : null}
		</button>
	);
}

export function AuthOptions({
	redirect,
	mode,
}: {
	redirect?: string;
	mode: "signin" | "signup";
}) {
	const [step, setStep] = useState<"options" | "password" | "twoFactor">(
		"options",
	);
	const [password, setPassword] = useState("");
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState("");
	// Read once. Re-reading on render would flicker the chip as methods are used.
	const [lastMethod] = useState<Method | null>(() => getLastMethod());

	const destination = () => resolveDestination(redirect);

	/**
	 * 🔴 EVERY sign-in result goes through here. Better Auth does NOT return a
	 * session when an account has two-factor enabled — it returns
	 * `twoFactorRedirect`, and the call still looks successful. Treating "no
	 * error" as "signed in" therefore sends those people to the dashboard with no
	 * session, where they bounce straight back to this page having done nothing
	 * wrong. Anyone with 2FA on simply could not sign in.
	 */
	const settle = (data: unknown) => {
		if (data && typeof data === "object" && "twoFactorRedirect" in data) {
			setStep("twoFactor");
			return;
		}
		window.location.href = destination();
	};

	const sendCode = async (event: FormEvent) => {
		event.preventDefault();
		// ⚠️ Checked here rather than left to the browser. `type="email"` catches a
		// bare `k` but accepts `k@k`, and more importantly it reports through the
		// browser's own bubble — which ignores the error slot this app uses, styles
		// itself like a different product, and vanishes on the next keystroke.
		const problem = emailProblem(email);
		if (problem) {
			setError(problem);
			return;
		}
		setPending("email");
		setError("");
		const result = await emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		setPending(null);
		// 🔴 Vague on purpose. "No account with that email" turns this into a way
		// to test which addresses are registered — a disclosure problem anywhere,
		// and a serious one for a tool whose customers ARE the asset.
		if (result?.error) {
			setError(
				describeError(
					result.error,
					// 🔴 Vague on purpose when the API DID answer: naming an unknown
					// address turns this into a way to test which emails are
					// registered. Network and outage cases are safe to be specific
					// about, and `describeError` tells them apart.
					"That did not work. Check the address and try again.",
				),
			);
			return;
		}
		// ⚠️ Hand off to a ROUTE rather than swapping a step in place. The visitor
		// is about to leave for their mail app, and a tab that gets discarded takes
		// an in-component step with it — see `routes/code.tsx`.
		setLastMethod("email");
		setPendingEmail(email);
		const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
		window.location.href = `/code${query}`;
	};

	const social = (provider: "google" | "github") => {
		setPending(provider);
		// 🔴 `errorCallbackURL` is what turns a silent failure into a sentence.
		// Without it, cancelling the Google consent screen or hitting an expired
		// grant returns the visitor to a page with no session and no explanation —
		// they see the sign-in form again and assume the button is broken.
		//
		// No await and no catch: this navigates away. The button staying disabled
		// is the correct state while the browser leaves the page.
		setLastMethod(provider);
		signIn.social({
			provider,
			callbackURL: destination(),
			errorCallbackURL: `${window.location.origin}/signin?reason=oauth`,
		});
	};

	const withPasskey = async () => {
		setPending("passkey");
		setError("");
		const result = await signIn.passkey();
		setPending(null);
		if (!result?.error) setLastMethod("passkey");
		if (result?.error) {
			setError(describeError(result.error, "That passkey did not work."));
			return;
		}
		settle(result?.data);
	};

	const withPassword = async (event: FormEvent) => {
		event.preventDefault();
		const problem = emailProblem(email);
		if (problem) {
			setError(problem);
			return;
		}
		// ⚠️ NO strength check on the way IN. The rules apply to a password being
		// created, not to one that already exists — an account made before this
		// policy has a password that would fail it, and refusing to even attempt
		// the sign-in would lock that person out of their own account.
		setPending("password");
		setError("");
		const result = await signIn.email({ email, password });
		setPending(null);
		if (!result?.error) setLastMethod("password");
		if (result?.error) {
			// Deliberately not "wrong password" versus "no such account" — the pair
			// tells an attacker which addresses are registered.
			setError(
				describeError(result.error, "That email and password did not match."),
			);
			return;
		}
		settle(result?.data);
	};

	const field =
		"h-12 w-full rounded-full border border-white/15 bg-black/45 px-5 font-body font-light text-[0.9375rem] text-white outline-none backdrop-blur-sm transition-colors duration-300 placeholder:text-white/35 focus:border-white/35";

	// 🔴 The shared form, not a second copy. Password, passkey and the email code
	// can all land here, and three implementations of a security step is three
	// places for one of them to quietly stop offering recovery codes.
	if (step === "twoFactor") {
		return (
			<TwoFactorForm onDone={() => (window.location.href = destination())} />
		);
	}

	if (step === "password") {
		return (
			<form onSubmit={withPassword} className="flex flex-col gap-3">
				<input
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="you@company.com"
					aria-label="Email address"
					className={field}
				/>
				<PasswordField
					value={password}
					onChange={setPassword}
					placeholder="Password"
					label="Password"
					autoComplete="current-password"
				/>

				<AuthError>{error}</AuthError>

				<button
					type="submit"
					disabled={pending !== null}
					style={{ backgroundColor: ICE, color: "#000000" }}
					className="inline-flex h-12 items-center justify-center rounded-full font-body font-normal text-[0.9375rem] transition-opacity duration-300 ease-out hover:opacity-85 disabled:opacity-40"
				>
					{pending === "password" ? "Signing in…" : "Sign in"}
				</button>

				<div className="mt-1 flex items-center justify-between">
					{/* ⚠️ `/forgot`, NOT `/reset`. `/reset` reads a token from the email
					    link and is the second half of this flow, pointing here at it
					    lands on a screen with nothing to reset. */}
					<a
						href="/forgot"
						className="font-body font-light text-[0.8125rem] text-white/45 transition-colors hover:text-white"
					>
						Forgot password?
					</a>
					<button
						type="button"
						onClick={() => {
							setStep("options");
							setPassword("");
							setError("");
						}}
						className="font-body font-light text-[0.8125rem] text-white/45 transition-colors hover:text-white"
					>
						Use something else
					</button>
				</div>
			</form>
		);
	}

	const emailBlock = (
		<form onSubmit={sendCode} className="flex flex-col gap-3">
			<input
				type="email"
				autoComplete="email"
				required
				value={email}
				onChange={(event) => setEmail(event.target.value)}
				placeholder="you@company.com"
				aria-label="Email address"
				className={field}
			/>
			<Row
				type="submit"
				icon={<EnvelopeSimpleIcon size={17} />}
				disabled={pending !== null}
				last={lastMethod === "email"}
			>
				{pending === "email" ? "Sending a code…" : "Continue with Email"}
			</Row>
		</form>
	);

	const socialBlock = (
		<div className="flex flex-col gap-3">
			<Row
				icon={<GoogleIcon />}
				onClick={() => social("google")}
				disabled={pending !== null}
				last={lastMethod === "google"}
			>
				Continue with Google
			</Row>
			<Row
				icon={<GithubIcon />}
				onClick={() => social("github")}
				disabled={pending !== null}
				last={lastMethod === "github"}
			>
				Continue with GitHub
			</Row>
		</div>
	);

	return (
		<div className="flex flex-col gap-3">
			{/* Same order on both screens. It used to flip — email first on sign-in,
			    social first on sign-up, which meant the two pages rearranged
			    themselves as you moved between them, and anyone who bounced back and
			    forth had to re-find the option they wanted. Consistency beats the
			    marginal gain from optimising each screen separately. */}
			{emailBlock}
			{socialBlock}

			{/* Passkey is a first-class row rather than hidden behind a toggle. It
			    sat behind "Show other options" until 2026-08-10, but a passkey is the
			    fastest and safest way in for anyone who has one, and burying the best
			    option to save a line is the wrong trade. Last, because it means
			    nothing to anyone who has not enrolled one yet. */}
			<Row
				icon={<FingerprintIcon size={17} />}
				onClick={withPasskey}
				disabled={pending !== null}
				last={lastMethod === "passkey"}
			>
				{pending === "passkey"
					? "Waiting for passkey…"
					: "Continue with Passkey"}
			</Row>

			{mode === "signin" ? (
				<Row
					icon={<LockSimpleIcon size={17} />}
					onClick={() => {
						setStep("password");
						setError("");
					}}
					disabled={pending !== null}
					last={lastMethod === "password"}
				>
					Continue with Password
				</Row>
			) : null}

			<AuthError>{error}</AuthError>
		</div>
	);
}
