"use client";

import { ShieldCheck } from "@phosphor-icons/react";
import { twoFactor } from "@quickengine/auth/client";
import { type FormEvent, useState } from "react";

const headingClass =
	"font-display font-normal text-4xl text-foreground tracking-tight";
const primaryBtn =
	"rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50";
const subtleBtn =
	"rounded-lg border border-foreground/15 px-5 py-2.5 font-medium text-foreground text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50";
const inputCls =
	"w-full max-w-sm rounded-lg border border-input bg-transparent px-4 py-3 text-foreground outline-none transition-colors focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40";

type Sub = "intro" | "password" | "verify";

// Optional 2FA setup, shown only to email/password sign-ups as the first
// onboarding step. Every exit path calls onDone() to hand back to the flow, so
// skipping and finishing both continue into the rest of onboarding. Enabling
// requires the password (Better Auth's twoFactor.enable), so we collect it here.
export function TwoFactorStep({ onDone }: { onDone: () => void }) {
	const [sub, setSub] = useState<Sub>("intro");
	const [password, setPassword] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function onEnable(event: FormEvent) {
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
		setSub("verify");
	}

	async function onVerify(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		const { error: verifyError } = await twoFactor.verifyTotp({ code });
		setPending(false);
		if (verifyError) {
			setError(verifyError.message ?? "That code didn't match. Try again.");
			return;
		}
		onDone();
	}

	if (sub === "intro") {
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
					Add two-factor authentication — a code from your authenticator app on
					top of your password. You can always turn this on later in Settings.
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<button
						type="button"
						onClick={() => {
							setError("");
							setSub("password");
						}}
						className={primaryBtn}
					>
						Set up two-factor
					</button>
					<button type="button" onClick={onDone} className={subtleBtn}>
						Skip for now
					</button>
				</div>
			</>
		);
	}

	if (sub === "password") {
		return (
			<>
				<h1 className={headingClass}>Confirm your password</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					Enter your password to turn on two-factor authentication.
				</p>
				<form onSubmit={onEnable} className="mt-8 flex flex-col gap-3">
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
							onClick={() => setSub("intro")}
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

	// verify
	return (
		<>
			<h1 className={headingClass}>Scan and confirm</h1>
			<p className="mt-3 max-w-md text-muted-foreground">
				Add this key to your authenticator app, then enter the 6-digit code it
				shows to finish.
			</p>
			<div className="mt-8 flex max-w-sm flex-col gap-4">
				<div>
					<p className="mb-1 text-muted-foreground text-xs">Setup key</p>
					<div className="rounded-lg border border-input bg-foreground/[0.02] p-3 font-mono text-foreground text-xs break-all">
						{secret}
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
				<form onSubmit={onVerify} className="flex flex-col gap-3">
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
							Turn on & continue
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
