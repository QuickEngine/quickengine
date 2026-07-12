"use client";

import { Fingerprint, QrCode, ShieldCheck } from "@phosphor-icons/react";
import { passkey, twoFactor } from "@quickengine/auth/client";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";

const headingClass =
	"font-display font-normal text-4xl text-foreground tracking-tight";
const primaryBtn =
	"rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50";
const subtleBtn =
	"rounded-lg border border-foreground/15 px-5 py-2.5 font-medium text-foreground text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50";
const cardCls =
	"flex flex-col items-start rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:opacity-50";
const inputCls =
	"w-full max-w-sm rounded-lg border border-input bg-transparent px-4 py-3 text-foreground outline-none transition-colors focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40";

type View = "select" | "passkey-done" | "totp-password" | "totp-verify";

// Optional account-security step for email/password sign-ups (the first thing in
// onboarding). Lets the user PICK from the methods we've built — a passkey
// (biometric/security key) or an authenticator app (TOTP with a scannable QR +
// recovery codes) — or stack both. Every exit path calls onDone() to hand back
// to the flow, so skipping and finishing both continue into onboarding.
export function TwoFactorStep({ onDone }: { onDone: () => void }) {
	const [view, setView] = useState<View>("select");
	const [password, setPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function onAddPasskey() {
		setError("");
		setPending(true);
		try {
			const res = await passkey.addPasskey();
			if (res?.error) {
				setError(res.error.message ?? "Couldn't add a passkey. Try again.");
				return;
			}
			setView("passkey-done");
		} catch {
			setError("Couldn't reach the server. Please try again.");
		} finally {
			setPending(false);
		}
	}

	async function onEnableTotp(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		try {
			const { data, error: enableError } = await twoFactor.enable({ password });
			if (enableError || !data) {
				setError(
					enableError?.message ?? "Couldn't start setup — check your password.",
				);
				return;
			}
			setTotpUri(data.totpURI);
			setSecret(data.totpURI.match(/secret=([^&]+)/)?.[1] ?? "");
			setBackupCodes(data.backupCodes ?? []);
			setView("totp-verify");
		} catch {
			setError("Couldn't reach the server. Please try again.");
		} finally {
			setPending(false);
		}
	}

	async function onVerifyTotp(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		try {
			const { error: verifyError } = await twoFactor.verifyTotp({ code });
			if (verifyError) {
				setError(verifyError.message ?? "That code didn't match. Try again.");
				return;
			}
			onDone();
		} catch {
			setError("Couldn't reach the server. Please try again.");
		} finally {
			setPending(false);
		}
	}

	// Pick a method.
	if (view === "select") {
		return (
			<>
				<div className="flex size-12 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.06]">
					<ShieldCheck className="size-6 text-foreground" />
				</div>
				<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Optional
				</p>
				<h1 className={`mt-2 ${headingClass}`}>Secure your account</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					Add a second layer of protection. Pick a method — you can add more
					later in Settings.
				</p>
				<div className="mt-8 grid gap-4 sm:grid-cols-2">
					<button
						type="button"
						disabled={pending}
						onClick={onAddPasskey}
						className={cardCls}
					>
						<Fingerprint className="size-6 text-foreground" />
						<h2 className="mt-4 font-medium text-foreground">Passkey</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Face ID, Touch ID, fingerprint, or a security key. No app needed.
						</p>
					</button>
					<button
						type="button"
						disabled={pending}
						onClick={() => {
							setError("");
							setView("totp-password");
						}}
						className={cardCls}
					>
						<QrCode className="size-6 text-foreground" />
						<h2 className="mt-4 font-medium text-foreground">
							Authenticator app
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Scan a QR into Google Authenticator, 1Password, etc. Comes with
							recovery codes.
						</p>
					</button>
				</div>
				<button
					type="button"
					onClick={onDone}
					className={`${subtleBtn} mt-6 w-fit`}
				>
					Skip for now
				</button>
				{error ? <p className="mt-3 text-red-400 text-sm">{error}</p> : null}
			</>
		);
	}

	// Passkey added — offer to stack an authenticator too, or continue.
	if (view === "passkey-done") {
		return (
			<>
				<div className="flex size-12 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.06]">
					<Fingerprint className="size-6 text-foreground" />
				</div>
				<h1 className={`mt-6 ${headingClass}`}>Passkey added</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					You can now sign in with your device. Want an authenticator app as a
					backup too?
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<button type="button" onClick={onDone} className={primaryBtn}>
						Continue
					</button>
					<button
						type="button"
						onClick={() => {
							setError("");
							setView("totp-password");
						}}
						className={subtleBtn}
					>
						Add an authenticator app
					</button>
				</div>
			</>
		);
	}

	// Authenticator — confirm password to enable.
	if (view === "totp-password") {
		return (
			<>
				<h1 className={headingClass}>Confirm your password</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					Enter your password to set up an authenticator app.
				</p>
				<form onSubmit={onEnableTotp} className="mt-8 flex flex-col gap-3">
					<input
						className={inputCls}
						type="password"
						placeholder="Your password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					<div className="flex flex-wrap gap-3">
						<button type="submit" disabled={pending} className={primaryBtn}>
							Continue
						</button>
						<button
							type="button"
							onClick={() => setView("select")}
							className={subtleBtn}
						>
							Back
						</button>
					</div>
				</form>
				{error ? <p className="mt-3 text-red-400 text-sm">{error}</p> : null}
			</>
		);
	}

	// Authenticator — scan the QR + confirm a code.
	return (
		<>
			<h1 className={headingClass}>Scan and confirm</h1>
			<p className="mt-3 max-w-md text-muted-foreground">
				Scan this with your authenticator app, then enter the 6-digit code it
				shows.
			</p>
			<div className="mt-8 flex max-w-sm flex-col gap-4">
				<div className="flex items-start gap-4">
					<div className="rounded-lg bg-white p-3">
						<QRCodeSVG
							value={totpUri}
							size={132}
							bgColor="#ffffff"
							fgColor="#000000"
						/>
					</div>
					<div className="min-w-0">
						<p className="text-muted-foreground text-xs">
							Can't scan? Enter this key instead:
						</p>
						<div className="mt-1 rounded-lg border border-input bg-foreground/[0.02] p-2 font-mono text-foreground text-xs break-all">
							{secret}
						</div>
					</div>
				</div>
				{backupCodes.length > 0 ? (
					<div>
						<p className="mb-1 text-muted-foreground text-xs">
							Recovery codes — save these somewhere safe:
						</p>
						<div className="grid grid-cols-2 gap-1 rounded-lg border border-input bg-foreground/[0.02] p-3 font-mono text-foreground text-xs">
							{backupCodes.map((c) => (
								<span key={c}>{c}</span>
							))}
						</div>
					</div>
				) : null}
				<form onSubmit={onVerifyTotp} className="flex flex-col gap-3">
					<input
						className={inputCls}
						inputMode="numeric"
						placeholder="6-digit code"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						required
					/>
					<div className="flex flex-wrap gap-3">
						<button type="submit" disabled={pending} className={primaryBtn}>
							Turn on &amp; continue
						</button>
						<button type="button" onClick={onDone} className={subtleBtn}>
							Skip for now
						</button>
					</div>
				</form>
			</div>
			{error ? <p className="mt-3 text-red-400 text-sm">{error}</p> : null}
		</>
	);
}
