import { FingerprintIcon, QrCodeIcon } from "@phosphor-icons/react";
import { passkey, twoFactor } from "@quickengine/auth/client";
import { ICE } from "@quickengine/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
	AuthButton,
	AuthError,
	AuthScreen,
	authOptionRow,
} from "@/components/auth-screen";
import { CodeInput } from "@/components/code-input";
import { PasswordField } from "@/components/password-field";
import { describeError } from "@/lib/describe-error";
import { env } from "@/lib/env";
import { hasSession } from "@/lib/guards";

const ACCOUNT_URL = env.VITE_ACCOUNT_URL;

function goToDashboard() {
	window.location.href = ACCOUNT_URL;
}

type Step = "choose" | "totp-password" | "totp-verify" | "done";

/**
 * Optional second factor, offered once after verification.
 *
 * ⚠️ Skipping must stay a first-class option. This screen sits between someone
 * finishing signup and reaching the product — making it feel mandatory is how a
 * security step turns into an abandonment point, and an account that never
 * finishes signup is not protected by anything.
 *
 * 🔴 RECOVERY CODES ARE SHOWN EXACTLY ONCE. Better Auth returns them from
 * `enable()` and never again. If this screen fails to make someone save them,
 * the next lost phone is a support ticket that cannot be resolved without
 * disabling the factor — which is the social-engineering path 2FA exists to
 * close. That is why they are given their own step rather than sitting above a
 * form as a footnote.
 */
function Page() {
	const [step, setStep] = useState<Step>("choose");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [method, setMethod] = useState<"passkey" | "authenticator">("passkey");
	const [saved, setSaved] = useState(false);

	const [password, setPassword] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");

	async function addPasskey() {
		setError("");
		setPending(true);
		const res = await passkey.addPasskey();
		setPending(false);
		if (res?.error) {
			setError(describeError(res.error, "Couldn't add a passkey. Try again."));
			return;
		}
		setMethod("passkey");
		setStep("done");
	}

	async function startTotp(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		const { data, error: enableError } = await twoFactor.enable({ password });
		setPending(false);
		if (enableError || !data) {
			setError(
				enableError?.message ?? "Couldn't start setup, check your password.",
			);
			return;
		}
		setSecret(data.totpURI.match(/secret=([^&]+)/)?.[1] ?? "");
		setBackupCodes(data.backupCodes ?? []);
		setStep("totp-verify");
	}

	async function verifyTotp(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		const { error: verifyError } = await twoFactor.verifyTotp({ code });
		setPending(false);
		if (verifyError) {
			setError(
				describeError(verifyError, "That code didn't match. Try again."),
			);
			return;
		}
		setMethod("authenticator");
		setStep("done");
	}

	// Built once, rendered in each of the three states this screen has. The slot
	// holds its height even when `error` is empty, which is what keeps the button
	// still while someone is reaching for it.
	const errorLine = <AuthError>{error}</AuthError>;

	// The two methods, offered as equals.
	if (step === "choose") {
		return (
			<AuthScreen
				title="Secure your account"
				subtitle="Optional, and it takes about a minute."
			>
				<div className="flex flex-col gap-3">
					<button
						type="button"
						disabled={pending}
						onClick={addPasskey}
						style={{ borderColor: `${ICE}1F`, color: ICE }}
						className={authOptionRow}
					>
						<span className="flex w-5 shrink-0 justify-center">
							<FingerprintIcon size={17} />
						</span>
						{pending ? "Waiting…" : "Add a passkey"}
					</button>

					<button
						type="button"
						onClick={() => {
							setError("");
							setStep("totp-password");
						}}
						style={{ borderColor: `${ICE}1F`, color: ICE }}
						className={authOptionRow}
					>
						<span className="flex w-5 shrink-0 justify-center">
							<QrCodeIcon size={17} />
						</span>
						Use an authenticator app
					</button>

					{errorLine}

					{/* Skip stays plainly available. Hidden or greyed, this screen stops
					    being optional and starts being a wall. */}
					<button
						type="button"
						onClick={goToDashboard}
						className="mt-1 font-body font-light text-[0.8125rem] text-white/50 transition-colors hover:text-white"
					>
						Skip for now
					</button>
				</div>
			</AuthScreen>
		);
	}

	if (step === "totp-password") {
		return (
			<AuthScreen
				title="Confirm your password"
				subtitle="Just checking it is you."
			>
				<form onSubmit={startTotp} className="flex flex-col gap-3">
					<PasswordField
						value={password}
						onChange={setPassword}
						placeholder="Password"
						label="Password"
						autoComplete="current-password"
					/>
					{errorLine}
					<AuthButton disabled={pending || !password}>
						{pending ? "Setting up…" : "Continue"}
					</AuthButton>
					<button
						type="button"
						onClick={() => setStep("choose")}
						className="mt-1 font-body font-light text-[0.8125rem] text-white/50 transition-colors hover:text-white"
					>
						Back
					</button>
				</form>
			</AuthScreen>
		);
	}

	if (step === "totp-verify") {
		// 🔴 The codes get their own step, and the form is gated behind confirming
		// they are saved. Shown alongside the input, people type the code, land in
		// the product, and the codes are gone forever — they are only ever returned
		// once.
		if (backupCodes.length > 0 && !saved) {
			return (
				<AuthScreen
					title="Save your recovery codes"
					subtitle="You will not see these again."
				>
					<div className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/15 bg-black/45 p-4 font-mono text-[0.8125rem] text-white backdrop-blur-sm">
							{backupCodes.map((value) => (
								<span key={value} className="text-center">
									{value}
								</span>
							))}
						</div>

						<button
							type="button"
							onClick={() => {
								navigator.clipboard?.writeText(backupCodes.join("\n"));
							}}
							style={{ borderColor: `${ICE}1F`, color: ICE }}
							className="inline-flex h-12 w-full items-center justify-center rounded-full border bg-black/45 font-body font-light text-[0.9375rem] backdrop-blur-sm transition-colors duration-300 hover:bg-black/65"
						>
							Copy codes
						</button>

						<AuthButton type="button" onClick={() => setSaved(true)}>
							I've saved them
						</AuthButton>
					</div>
				</AuthScreen>
			);
		}

		return (
			<AuthScreen
				title="Add it to your app"
				subtitle="Paste the key, then enter the code it shows."
			>
				<form onSubmit={verifyTotp} className="flex flex-col gap-5">
					<div className="select-all break-all rounded-2xl border border-white/15 bg-black/45 p-4 text-center font-mono text-[0.8125rem] text-white backdrop-blur-sm">
						{secret}
					</div>

					<CodeInput value={code} onChange={setCode} disabled={pending} />

					{errorLine}

					<AuthButton disabled={pending || code.length < 6}>
						{pending ? "Verifying…" : "Confirm"}
					</AuthButton>
				</form>
			</AuthScreen>
		);
	}

	return (
		<AuthScreen
			title="You're protected"
			subtitle="Manage this any time in Settings."
		>
			<div className="flex flex-col gap-4">
				<p className="text-center font-body font-light text-[0.9375rem] text-white/55">
					{method === "passkey"
						? "Your passkey is set up."
						: "Two-factor authentication is on."}{" "}
					You can manage this any time in Settings.
				</p>
				<AuthButton type="button" onClick={goToDashboard}>
					Continue
				</AuthButton>
			</div>
		</AuthScreen>
	);
}

export const Route = createFileRoute("/secure")({
	// Setting up two-factor is something you do TO an account, so there has to be
	// one signed in. Without this the screen offered to secure nothing.
	beforeLoad: async () => {
		if (!(await hasSession()))
			throw redirect({
				to: "/signin",
				search: {
					// ⚠️ Every key stated. `/signin` declares `validateSearch`, so its
					// search shape is required in full here even though all three are
					// optional at runtime — `{}` does not satisfy it.
					redirect: undefined,
					signedout: undefined,
					reason: undefined,
				},
			});
	},
	component: Page,
});
