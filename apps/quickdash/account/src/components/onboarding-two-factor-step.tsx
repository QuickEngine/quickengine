import { Fingerprint, QrCode, ShieldCheck } from "@phosphor-icons/react";
import { passkey, twoFactor } from "@quickengine/auth/client";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";

const heading =
	"font-display font-normal text-4xl text-foreground tracking-tight";
const primary =
	"rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm hover:opacity-90 disabled:opacity-50";
const secondary =
	"rounded-lg border border-foreground/15 px-5 py-2.5 font-medium text-foreground text-sm hover:bg-foreground/5 disabled:opacity-50";
const card =
	"flex flex-col items-start rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 text-left hover:border-foreground/20 hover:bg-foreground/[0.04] disabled:opacity-50";
const input =
	"w-full max-w-sm rounded-lg border border-input bg-transparent px-4 py-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40";

type View = "select" | "passkey-done" | "totp-password" | "totp-verify";

export function OnboardingTwoFactorStep({ onDone }: { onDone: () => void }) {
	const [view, setView] = useState<View>("select");
	const [password, setPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function addPasskey() {
		setPending(true);
		setError("");
		try {
			const result = await passkey.addPasskey();
			if (result?.error)
				setError(result.error.message ?? "Couldn't add a passkey. Try again.");
			else setView("passkey-done");
		} catch {
			setError("Couldn't reach the server. Please try again.");
		} finally {
			setPending(false);
		}
	}

	async function enableTotp(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError("");
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

	async function verifyTotp(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError("");
		try {
			const { error: verifyError } = await twoFactor.verifyTotp({ code });
			if (verifyError)
				setError(verifyError.message ?? "That code didn't match. Try again.");
			else onDone();
		} catch {
			setError("Couldn't reach the server. Please try again.");
		} finally {
			setPending(false);
		}
	}

	if (view === "select")
		return (
			<>
				<div className="flex size-12 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.06]">
					<ShieldCheck className="size-6" />
				</div>
				<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Optional
				</p>
				<h1 className={`mt-2 ${heading}`}>Secure your account</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					Add a second layer of protection. Pick a method — you can add more
					later in Settings.
				</p>
				<div className="mt-8 grid gap-4 sm:grid-cols-2">
					<button
						type="button"
						disabled={pending}
						onClick={addPasskey}
						className={card}
					>
						<Fingerprint className="size-6" />
						<h2 className="mt-4 font-medium">Passkey</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Face ID, Touch ID, fingerprint, or a security key. No app needed.
						</p>
					</button>
					<button
						type="button"
						disabled={pending}
						onClick={() => setView("totp-password")}
						className={card}
					>
						<QrCode className="size-6" />
						<h2 className="mt-4 font-medium">Authenticator app</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Scan a QR into your authenticator. Includes recovery codes.
						</p>
					</button>
				</div>
				<button type="button" onClick={onDone} className={`${secondary} mt-6`}>
					Skip for now
				</button>
				{error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
			</>
		);

	if (view === "passkey-done")
		return (
			<>
				<Fingerprint className="size-12" />
				<h1 className={`mt-6 ${heading}`}>Passkey added</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					You can now sign in with your device. Want an authenticator app as a
					backup too?
				</p>
				<div className="mt-8 flex gap-3">
					<button type="button" onClick={onDone} className={primary}>
						Continue
					</button>
					<button
						type="button"
						onClick={() => setView("totp-password")}
						className={secondary}
					>
						Add an authenticator app
					</button>
				</div>
			</>
		);

	if (view === "totp-password")
		return (
			<>
				<h1 className={heading}>Confirm your password</h1>
				<p className="mt-3 text-muted-foreground">
					Enter your password to set up an authenticator app.
				</p>
				<form onSubmit={enableTotp} className="mt-8 flex flex-col gap-3">
					<input
						className={input}
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						required
					/>
					<div className="flex gap-3">
						<button type="submit" disabled={pending} className={primary}>
							Continue
						</button>
						<button
							type="button"
							onClick={() => setView("select")}
							className={secondary}
						>
							Back
						</button>
					</div>
				</form>
				{error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
			</>
		);

	return (
		<>
			<h1 className={heading}>Scan and confirm</h1>
			<p className="mt-3 text-muted-foreground">
				Scan this with your authenticator app, then enter its 6-digit code.
			</p>
			<div className="mt-8 flex max-w-sm flex-col gap-4">
				<div className="flex items-start gap-4">
					<div className="rounded-lg bg-white p-3">
						<QRCodeSVG value={totpUri} size={132} />
					</div>
					<div className="min-w-0 text-xs">
						<p className="text-muted-foreground">Can't scan?</p>
						<div className="mt-1 break-all rounded-lg border p-2 font-mono">
							{secret}
						</div>
					</div>
				</div>
				{backupCodes.length > 0 && (
					<div className="grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-xs">
						{backupCodes.map((backupCode) => (
							<span key={backupCode}>{backupCode}</span>
						))}
					</div>
				)}
				<form onSubmit={verifyTotp} className="flex flex-col gap-3">
					<input
						className={input}
						inputMode="numeric"
						placeholder="6-digit code"
						value={code}
						onChange={(event) => setCode(event.target.value)}
						required
					/>
					<div className="flex gap-3">
						<button type="submit" disabled={pending} className={primary}>
							Turn on &amp; continue
						</button>
						<button type="button" onClick={onDone} className={secondary}>
							Skip for now
						</button>
					</div>
				</form>
			</div>
			{error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
		</>
	);
}
