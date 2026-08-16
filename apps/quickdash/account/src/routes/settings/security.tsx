import {
	CheckCircleIcon,
	KeyIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { passkey, twoFactor, useSession } from "@quickengine/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Security → Authentication. Passkeys and two-factor.
 *
 * 🔴 Recovery codes are shown ONCE, at the moment two-factor is turned on, and
 * are unrecoverable afterwards. That is a property of how they are stored, not a
 * UI choice — so the screen that shows them says so plainly and refuses to move
 * on until they have been acknowledged. Somebody who loses a phone with no codes
 * has lost the account.
 *
 * ⚠️ Enabling and disabling both require the password. Better Auth demands it,
 * and rightly: an unlocked laptop should not be enough to remove somebody's
 * second factor.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 w-56 rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

type Step = "idle" | "password" | "verify" | "codes";

function SecurityPage() {
	const { data: session } = useSession();
	const enabled = Boolean(
		(session?.user as { twoFactorEnabled?: boolean } | undefined)
			?.twoFactorEnabled,
	);

	const [step, setStep] = useState<Step>("idle");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [secret, setSecret] = useState("");
	const [codes, setCodes] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState("");
	const [note, setNote] = useState("");

	const reset = () => {
		setStep("idle");
		setPassword("");
		setCode("");
		setSecret("");
		setCodes([]);
		setFailure("");
	};

	const addPasskey = async () => {
		setBusy(true);
		setFailure("");
		setNote("");
		const result = await passkey.addPasskey();
		setBusy(false);
		if (result?.error) {
			setFailure(result.error.message ?? "That passkey could not be added.");
			return;
		}
		setNote("Passkey added. It can sign you in without a password.");
	};

	const startTwoFactor = async () => {
		setBusy(true);
		setFailure("");
		const { data, error } = await twoFactor.enable({ password });
		setBusy(false);
		if (error || !data) {
			setFailure(error?.message ?? "That password was not accepted.");
			return;
		}
		setSecret(data.totpURI.match(/secret=([^&]+)/)?.[1] ?? "");
		setCodes(data.backupCodes ?? []);
		setStep("verify");
	};

	const verifyTwoFactor = async () => {
		setBusy(true);
		setFailure("");
		const { error } = await twoFactor.verifyTotp({ code });
		setBusy(false);
		if (error) {
			setFailure(error.message ?? "That code did not match.");
			return;
		}
		setStep(codes.length > 0 ? "codes" : "idle");
		setNote("Two-factor authentication is on.");
	};

	const disableTwoFactor = async () => {
		setBusy(true);
		setFailure("");
		const { error } = await twoFactor.disable({ password });
		setBusy(false);
		if (error) {
			setFailure(error.message ?? "That password was not accepted.");
			return;
		}
		reset();
		setNote("Two-factor authentication is off.");
	};

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{failure ? (
				<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
			) : null}
			{note ? <p className="mb-4 text-[12px] text-[#3fb950]">{note}</p> : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Passkeys</p>
			<div className="flex flex-wrap items-center gap-4 border-[var(--console-line-soft)] border-t py-4">
				<KeyIcon size={16} className="shrink-0 text-[var(--ink-45)]" />
				<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-40)] leading-5">
					Sign in with the fingerprint, face or screen lock on a device you
					already trust. Nothing is typed, so nothing can be phished.
				</p>
				<button
					type="button"
					disabled={busy}
					onClick={() => void addPasskey()}
					className={quietAction}
				>
					Add a passkey
				</button>
			</div>

			<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Two-factor authentication
			</p>
			<div className="border-[var(--console-line-soft)] border-t py-4">
				<div className="flex flex-wrap items-center gap-4">
					<ShieldCheckIcon
						size={16}
						className={`shrink-0 ${enabled ? "text-[#3fb950]" : "text-[var(--ink-45)]"}`}
					/>
					<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-40)] leading-5">
						{enabled
							? "On. A code from your authenticator app is required to sign in."
							: "Off. A stolen password is currently enough to sign in as you."}
					</p>
					{step === "idle" ? (
						<button
							type="button"
							onClick={() => setStep("password")}
							className={enabled ? quietAction : primaryAction}
						>
							{enabled ? "Turn off" : "Turn on"}
						</button>
					) : null}
				</div>

				{step === "password" ? (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void (enabled ? disableTwoFactor() : startTwoFactor());
						}}
						className="mt-4 flex flex-wrap items-center gap-2"
					>
						<input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="Your password"
							aria-label="Your password"
							autoComplete="current-password"
							className={field}
						/>
						<button
							type="submit"
							disabled={busy || !password}
							className={primaryAction}
						>
							{busy ? "Checking…" : enabled ? "Turn off" : "Continue"}
						</button>
						<button type="button" onClick={reset} className={quietAction}>
							Cancel
						</button>
					</form>
				) : null}

				{step === "verify" ? (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void verifyTwoFactor();
						}}
						className="mt-4"
					>
						<p className="text-[11.5px] text-[var(--ink-40)] leading-5">
							Add this secret to your authenticator app, then enter the code it
							shows.
						</p>
						<p className="mt-2 select-all break-all rounded-md bg-[rgb(var(--console-ink)/0.05)] px-3 py-2 font-mono text-[12px] text-[var(--ink-85)]">
							{secret}
						</p>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<input
								value={code}
								onChange={(event) => setCode(event.target.value)}
								placeholder="6-digit code"
								aria-label="Code from your authenticator app"
								inputMode="numeric"
								autoComplete="one-time-code"
								className={field}
							/>
							<button
								type="submit"
								disabled={busy || code.length < 6}
								className={primaryAction}
							>
								{busy ? "Verifying…" : "Verify"}
							</button>
							<button type="button" onClick={reset} className={quietAction}>
								Cancel
							</button>
						</div>
					</form>
				) : null}

				{/* 🔴 Shown once, and never again. Storing them hashed is what makes
				    them safe, and it is also what makes this the only chance. */}
				{step === "codes" ? (
					<div className="mt-4">
						<p className="text-[12px] text-[#f5b44a] leading-5">
							Save these recovery codes now. They are the only way back in if
							you lose your authenticator, and they cannot be shown again.
						</p>
						<div className="mt-3 grid max-w-md grid-cols-2 gap-1 rounded-md bg-[rgb(var(--console-ink)/0.05)] p-3">
							{codes.map((value) => (
								<p
									key={value}
									className="select-all font-mono text-[12px] text-[var(--ink-85)]"
								>
									{value}
								</p>
							))}
						</div>
						<button
							type="button"
							onClick={reset}
							className={`${primaryAction} mt-3`}
						>
							<CheckCircleIcon size={13} className="mr-1.5" />I have saved them
						</button>
					</div>
				) : null}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/settings/security")({
	component: SecurityPage,
});
