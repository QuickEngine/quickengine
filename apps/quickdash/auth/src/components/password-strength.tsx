import { ALERT, ICE } from "@quickengine/ui";
import { passwordRules, passwordScore } from "@/lib/validation";

/**
 * The bar and the checklist under a new password.
 *
 * ⚠️ Only ever under a password being CREATED, never one being typed to sign in
 * with. Rating an existing password while somebody enters it is pure noise —
 * they cannot change it here, and telling a person their real password is weak
 * at the moment they are trying to get in is a way to make them think they typed
 * it wrong.
 *
 * The checklist is not hidden once satisfied. A rule that disappears when met
 * leaves people unsure whether they solved it or whether it stopped applying,
 * and the list jumping shorter as you type moves the button underneath it.
 */

// Four filled segments rather than one growing bar: a discrete count is easier
// to read at a glance than a length, and it cannot be misread as a progress bar
// for something that is loading.
const SEGMENTS = [0, 1, 2, 3];

export function PasswordStrength({ value }: { value: string }) {
	const score = passwordScore(value);
	const rules = passwordRules(value);

	// Nothing typed yet, nothing to say. The checklist appearing on first
	// keystroke reads as guidance; sitting there before you start reads as a
	// list of demands.
	if (!value) return null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex gap-1.5" aria-hidden="true">
				{SEGMENTS.map((segment) => (
					<span
						key={segment}
						style={{
							backgroundColor:
								score > segment
									? score <= 2
										? ALERT
										: ICE
									: "rgba(255,255,255,0.10)",
						}}
						className="h-[3px] flex-1 rounded-full transition-colors duration-300"
					/>
				))}
			</div>

			{/* `aria-live` off: this updates on every keystroke, and announcing five
			    rules each time would make the field unusable with a screen reader.
			    The submit button's own disabled state and the error slot carry the
			    outcome instead. */}
			<ul className="flex flex-col gap-1.5">
				{rules.map((rule) => (
					<li
						key={rule.label}
						style={{ color: rule.met ? ICE : undefined }}
						className={`flex items-center gap-2 font-body font-light text-[0.75rem] ${rule.met ? "" : "text-white/35"}`}
					>
						<span
							aria-hidden="true"
							style={{
								backgroundColor: rule.met ? ICE : "rgba(255,255,255,0.18)",
							}}
							className="size-1 shrink-0 rounded-full transition-colors duration-300"
						/>
						{rule.label}
					</li>
				))}
			</ul>
		</div>
	);
}
