import { CheckIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * What every save in this console looks like, from press to confirmation.
 *
 * ── The three states ─────────────────────────────────────────────────────────
 *
 *   idle    the label, "Save" or whatever the caller passes
 *   saving  "Saving…" with the glint running over it
 *   saved   a tick, briefly, then back to idle
 *
 * 🔴 The button MUST NOT change size between them. "Save" is four characters
 * and "Saving…" is seven, so swapping the text moves the button and everything
 * beside it, which reads as the page twitching at the exact moment somebody is
 * watching to see whether their work landed.
 *
 * 🔑 All three labels are stacked in ONE grid cell, so the button is always as
 * wide as its widest state and nothing moves. Hiding them with `invisible`
 * rather than removing them keeps them occupying that cell.
 */

/** How long the tick stays before the button goes back to its label. */
const SAVED_MS = 1600;

export function useSavedFlash(isSuccess: boolean): boolean {
	const [flash, setFlash] = useState(false);
	const seen = useRef(false);
	useEffect(() => {
		if (!isSuccess) {
			seen.current = false;
			return;
		}
		// Only on the EDGE. A mutation stays successful until the next one
		// starts, so without this the tick would sit there for ever.
		if (seen.current) return;
		seen.current = true;
		setFlash(true);
		const timer = setTimeout(() => setFlash(false), SAVED_MS);
		return () => clearTimeout(timer);
	}, [isSuccess]);
	return flash;
}

export function SaveLabel({
	saving,
	saved,
	children,
	savingLabel = "Saving…",
}: {
	saving: boolean;
	saved: boolean;
	/** The resting label. "Save", "Create product", "Send". */
	children: ReactNode;
	savingLabel?: string;
}) {
	return (
		<span className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
			<span className={saving || saved ? "invisible" : ""}>{children}</span>
			<span className={saving ? "" : "invisible"}>{savingLabel}</span>
			<span className={saved ? "" : "invisible"} aria-hidden={!saved}>
				<CheckIcon size={14} weight="bold" />
			</span>
		</span>
	);
}
