"use client";

import { passkey, twoFactor, useSession } from "@quickengine/auth/client";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";

const primaryBtn =
	"rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50";
const subtleBtn =
	"rounded-lg border border-foreground/15 px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50";
const inputCls =
	"w-full max-w-xs rounded-lg border border-input bg-transparent px-3 py-2 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/40";

type TotpStep = "idle" | "password" | "verify";

// Settings → Security: manage passkeys + two-factor. Uses the auth client, which
// calls the auth app's API (the single identity authority).
export function SecuritySettings() {
	const { data: session } = useSession();
	const twoFAOn = Boolean(
		(session?.user as { twoFactorEnabled?: boolean } | undefined)
			?.twoFactorEnabled,
	);

	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [note, setNote] = useState("");

	const [step, setStep] = useState<TotpStep>("idle");
	const [password, setPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");

	async function onAddPasskey() {
		setError("");
		setNote("");
		setPending(true);
		const res = await passkey.addPasskey();
		setPending(false);
		if (res?.error) {
			setError(res.error.message ?? "Couldn't add a passkey.");
			return;
		}
		setNote("Passkey added.");
	}

	async function onStartEnable(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		const { data, error: enableError } = await twoFactor.enable({ password });
		setPending(false);
		if (enableError || !data) {
			setError(
				enableError?.message ?? "Couldn't start setup — check password.",
			);
			return;
		}
		setTotpUri(data.totpURI);
		setSecret(data.totpURI.match(/secret=([^&]+)/)?.[1] ?? "");
		setBackupCodes(data.backupCodes ?? []);
		setStep("verify");
	}

	async function onVerifyEnable(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		const { error: verifyError } = await twoFactor.verifyTotp({ code });
		setPending(false);
		if (verifyError) {
			setError(verifyError.message ?? "That code didn't match.");
			return;
		}
		setStep("idle");
		setPassword("");
		setCode("");
		setNote("Two-factor is on.");
	}

	async function onDisable(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		const { error: disableError } = await twoFactor.disable({ password });
		setPending(false);
		if (disableError) {
			setError(disableError.message ?? "Couldn't turn off — check password.");
			return;
		}
		setStep("idle");
		setPassword("");
		setNote("Two-factor is off.");
	}

	return (
		<div className="flex max-w-md flex-col gap-8">
			{/* Passkeys */}
			<section>
				<h3 className="font-medium text-foreground text-sm">Passkeys</h3>
				<p className="mt-1 text-muted-foreground text-xs">
					Sign in with Face ID, Touch ID, or your device — no password.
				</p>
				<button
					type="button"
					disabled={pending}
					onClick={onAddPasskey}
					className={`${subtleBtn} mt-3`}
				>
					Add a passkey
				</button>
			</section>

			{/* Two-factor */}
			<section>
				<div className="flex items-center justify-between">
					<div>
						<h3 className="font-medium text-foreground text-sm">
							Two-factor authentication
						</h3>
						<p className="mt-1 text-muted-foreground text-xs">
							An authenticator code on top of your password.
						</p>
					</div>
					<span
						className={`rounded-full px-2 py-0.5 text-[11px] ${
							twoFAOn
								? "bg-foreground/10 text-foreground"
								: "border border-foreground/15 text-muted-foreground"
						}`}
					>
						{twoFAOn ? "On" : "Off"}
					</span>
				</div>

				{/* Off → enable flow */}
				{!twoFAOn && step === "idle" && (
					<button
						type="button"
						onClick={() => {
							setError("");
							setNote("");
							setStep("password");
						}}
						className={`${primaryBtn} mt-3`}
					>
						Set up
					</button>
				)}

				{!twoFAOn && step === "password" && (
					<form onSubmit={onStartEnable} className="mt-3 flex flex-col gap-2">
						<input
							className={inputCls}
							type="password"
							placeholder="Confirm your password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
						<div className="flex gap-2">
							<button type="submit" disabled={pending} className={primaryBtn}>
								Continue
							</button>
							<button
								type="button"
								onClick={() => setStep("idle")}
								className={subtleBtn}
							>
								Cancel
							</button>
						</div>
					</form>
				)}

				{!twoFAOn && step === "verify" && (
					<div className="mt-3 flex flex-col gap-3">
						<div className="flex items-start gap-3">
							<div className="rounded-lg bg-white p-2.5">
								<QRCodeSVG
									value={totpUri}
									size={112}
									bgColor="#ffffff"
									fgColor="#000000"
								/>
							</div>
							<div className="min-w-0">
								<p className="mb-1 text-muted-foreground text-xs">
									Scan, or enter this key:
								</p>
								<div className="rounded-lg border border-input bg-foreground/[0.02] p-2 font-mono text-foreground text-xs break-all">
									{secret}
								</div>
							</div>
						</div>
						{backupCodes.length > 0 && (
							<div>
								<p className="mb-1 text-muted-foreground text-xs">
									Recovery codes (save these):
								</p>
								<div className="grid grid-cols-2 gap-1 rounded-lg border border-input bg-foreground/[0.02] p-2 font-mono text-foreground text-xs">
									{backupCodes.map((c) => (
										<span key={c}>{c}</span>
									))}
								</div>
							</div>
						)}
						<form onSubmit={onVerifyEnable} className="flex flex-col gap-2">
							<input
								className={inputCls}
								inputMode="numeric"
								placeholder="6-digit code"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								required
							/>
							<button type="submit" disabled={pending} className={primaryBtn}>
								Confirm
							</button>
						</form>
					</div>
				)}

				{/* On → disable */}
				{twoFAOn && step !== "password" && (
					<button
						type="button"
						onClick={() => setStep("password")}
						className={`${subtleBtn} mt-3`}
					>
						Turn off
					</button>
				)}
				{twoFAOn && step === "password" && (
					<form onSubmit={onDisable} className="mt-3 flex flex-col gap-2">
						<input
							className={inputCls}
							type="password"
							placeholder="Confirm your password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
						<div className="flex gap-2">
							<button type="submit" disabled={pending} className={primaryBtn}>
								Turn off
							</button>
							<button
								type="button"
								onClick={() => setStep("idle")}
								className={subtleBtn}
							>
								Cancel
							</button>
						</div>
					</form>
				)}
			</section>

			{error && <p className="text-red-400 text-sm">{error}</p>}
			{note && <p className="text-muted-foreground text-sm">{note}</p>}
		</div>
	);
}
