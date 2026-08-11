import { twoFactor } from "@quickengine/auth/client";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthButton, AuthError, authField } from "@/components/auth-screen";
import { describeError } from "@/lib/describe-error";

/**
 * The second factor, shared by every path that can trigger it.
 *
 * ⚠️ Extracted rather than written twice. A code, a password and a passkey can
 * ALL return `twoFactorRedirect`, so each entry point needs this screen — and
 * three copies of a security step is three places for one of them to quietly
 * stop offering recovery codes.
 *
 * 🔴 Recovery codes are not optional. Without them the second factor is a single
 * point of failure: a lost phone means a support ticket, and support-driven 2FA
 * bypass is a social-engineering target.
 */
export function TwoFactorForm({ onDone }: { onDone: () => void }) {
	const [code, setCode] = useState("");
	const [useRecovery, setUseRecovery] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => {
		ref.current?.focus();
	}, []);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError("");
		const result = useRecovery
			? await twoFactor.verifyBackupCode({ code })
			: await twoFactor.verifyTotp({ code });
		setPending(false);
		if (result?.error) {
			setError(
				describeError(
					result.error,
					useRecovery
						? "That recovery code did not work."
						: "That code was not right.",
				),
			);
			return;
		}
		onDone();
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-3">
			<input
				autoComplete="one-time-code"
				inputMode={useRecovery ? "text" : "numeric"}
				required
				ref={ref}
				value={code}
				onChange={(event) =>
					setCode(
						useRecovery
							? event.target.value
							: event.target.value.replace(/\D/g, ""),
					)
				}
				placeholder={useRecovery ? "recovery code" : "000000"}
				aria-label={useRecovery ? "Recovery code" : "Authenticator code"}
				className={`${authField} text-center ${useRecovery ? "" : "tracking-[0.4em]"}`}
			/>

			<AuthError>{error}</AuthError>

			<AuthButton disabled={pending || code.length < 6}>
				{pending ? "Checking…" : "Continue"}
			</AuthButton>

			<button
				type="button"
				onClick={() => {
					setUseRecovery((value) => !value);
					setCode("");
					setError("");
				}}
				className="mt-1 font-body font-light text-[0.8125rem] text-white/45 transition-colors hover:text-white"
			>
				{useRecovery
					? "Use your authenticator app"
					: "Use a recovery code instead"}
			</button>
		</form>
	);
}
