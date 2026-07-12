"use client";

import { passkey, twoFactor } from "@quickengine/auth/client";
import { type FormEvent, useState } from "react";
import {
	AuthShell,
	field,
	primaryButton,
	subtleButton,
	textLink,
} from "../_auth-ui";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

function goToDashboard() {
	window.location.href = ACCOUNT_URL;
}

type Step = "choose" | "totp-password" | "totp-verify" | "done";

export default function Page() {
	const [step, setStep] = useState<Step>("choose");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [method, setMethod] = useState<"passkey" | "authenticator">("passkey");

	// TOTP setup state
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
			setError(res.error.message ?? "Couldn't add a passkey. Try again.");
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
				enableError?.message ?? "Couldn't start setup — check your password.",
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
			setError(verifyError.message ?? "That code didn't match. Try again.");
			return;
		}
		setMethod("authenticator");
		setStep("done");
	}

	// Step: choose a method (or skip)
	if (step === "choose") {
		return (
			<AuthShell>
				<div className="mb-6 text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Secure your account
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Add a second layer so only you can get in. Recommended — but you can
						skip and set it up later in Settings.
					</p>
				</div>
				{error && <p className="mb-3 text-[13px] text-red-400">{error}</p>}
				<div className="flex flex-col gap-3">
					<button
						type="button"
						disabled={pending}
						onClick={addPasskey}
						className={primaryButton}
					>
						{pending ? "Waiting…" : "Add a passkey (Face / Touch ID)"}
					</button>
					<button
						type="button"
						onClick={() => {
							setError("");
							setStep("totp-password");
						}}
						className={subtleButton}
					>
						Use an authenticator app
					</button>
				</div>
				<p className="mt-6 text-center text-[13px] text-muted-foreground">
					<button type="button" onClick={goToDashboard} className={textLink}>
						Skip for now
					</button>
				</p>
			</AuthShell>
		);
	}

	// Step: confirm password to begin TOTP setup
	if (step === "totp-password") {
		return (
			<AuthShell>
				<div className="mb-6 text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Confirm your password
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Enter your password to set up an authenticator app.
					</p>
				</div>
				<form onSubmit={startTotp} className="flex flex-col gap-3">
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
						{pending ? "Setting up…" : "Continue"}
					</button>
				</form>
				<p className="mt-6 text-center text-[13px] text-muted-foreground">
					<button
						type="button"
						onClick={() => setStep("choose")}
						className={textLink}
					>
						Back
					</button>
				</p>
			</AuthShell>
		);
	}

	// Step: show the setup key + recovery codes, verify a code
	if (step === "totp-verify") {
		return (
			<AuthShell>
				<div className="mb-6 text-center">
					<h1 className="font-medium text-[22px] text-foreground tracking-tight">
						Add it to your app
					</h1>
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Enter this key in your authenticator, then type the 6-digit code to
						confirm.
					</p>
				</div>
				<div className="mb-4 rounded-lg border border-input bg-foreground/[0.02] p-3 text-center font-mono text-[13px] text-foreground break-all">
					{secret}
				</div>
				{backupCodes.length > 0 && (
					<div className="mb-4">
						<p className="mb-2 text-[12px] text-muted-foreground">
							Save these recovery codes somewhere safe:
						</p>
						<div className="grid grid-cols-2 gap-1.5 rounded-lg border border-input bg-foreground/[0.02] p-3 font-mono text-[12px] text-foreground">
							{backupCodes.map((c) => (
								<span key={c}>{c}</span>
							))}
						</div>
					</div>
				)}
				<form onSubmit={verifyTotp} className="flex flex-col gap-3">
					<input
						className={field}
						inputMode="numeric"
						placeholder="6-digit code"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						required
					/>
					{error && <p className="text-[13px] text-red-400">{error}</p>}
					<button type="submit" disabled={pending} className={primaryButton}>
						{pending ? "Verifying…" : "Confirm"}
					</button>
				</form>
			</AuthShell>
		);
	}

	// Step: done
	return (
		<AuthShell>
			<div className="text-center">
				<h1 className="font-medium text-[22px] text-foreground tracking-tight">
					You're protected
				</h1>
				<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
					{method === "passkey"
						? "Your passkey is set up."
						: "Two-factor authentication is on."}{" "}
					You can manage this any time in Settings.
				</p>
				<button
					type="button"
					onClick={goToDashboard}
					className={`${primaryButton} mt-6 w-full`}
				>
					Continue
				</button>
			</div>
		</AuthShell>
	);
}
