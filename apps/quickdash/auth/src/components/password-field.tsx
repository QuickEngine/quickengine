import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { authField } from "@/components/auth-screen";
import { PasswordStrength } from "@/components/password-strength";

/**
 * A password input with a reveal toggle.
 *
 * ⚠️ The toggle is `type="button"`. A bare `<button>` inside a form defaults to
 * `submit` — so without this, showing your password submits the form, which on a
 * reset screen means posting an incomplete password and burning the token.
 *
 * The eye is `tabIndex={-1}` on purpose: tabbing from the password field should
 * reach the next field or the submit, not a visibility control. Anyone who wants
 * it can still click it, and screen readers get it from the label.
 *
 * Revealing is genuinely worth having here rather than being a nicety — a reset
 * screen asks for a password twice, and "those passwords don't match" with no
 * way to see either is the most common reason people abandon this flow.
 */
export function PasswordField({
	value,
	onChange,
	placeholder,
	label,
	autoComplete = "new-password",
	strength = false,
}: {
	value: string;
	onChange: (next: string) => void;
	placeholder: string;
	label: string;
	autoComplete?: "new-password" | "current-password";
	/**
	 * Show the strength bar and rule checklist beneath the field.
	 *
	 * ⚠️ Not inferred from `autoComplete="new-password"`, even though that is the
	 * same condition today. The two mean different things — one is a hint to the
	 * password manager, the other is a decision about what this screen teaches —
	 * and tying them together means a future screen cannot have one without the
	 * other.
	 */
	strength?: boolean;
}) {
	const [shown, setShown] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<div className="relative">
				<input
					className={`${authField} pe-14`}
					type={shown ? "text" : "password"}
					placeholder={placeholder}
					aria-label={label}
					autoComplete={autoComplete}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					required
				/>
				<button
					type="button"
					tabIndex={-1}
					onClick={() => setShown((value) => !value)}
					aria-label={
						shown
							? `Hide ${label.toLowerCase()}`
							: `Show ${label.toLowerCase()}`
					}
					aria-pressed={shown}
					className="-translate-y-1/2 absolute end-4 top-1/2 text-white/40 transition-colors duration-200 hover:text-white"
				>
					{shown ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
				</button>
			</div>
			{strength ? <PasswordStrength value={value} /> : null}
		</div>
	);
}
