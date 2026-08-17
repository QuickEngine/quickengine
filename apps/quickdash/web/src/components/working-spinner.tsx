import { ring2 } from "ldrs";
import { useEffect, useState } from "react";

/**
 * Something is still working, shown where the thing lives.
 *
 * 🔑 A DIFFERENT job from the skeletons. A skeleton says "this page has not
 * arrived"; this says "a job you started is still running, and you do not have
 * to sit here watching it". That is why it belongs on a nav row rather than in
 * the content area — it survives you navigating away, which is the whole point.
 *
 * ⚠️ Registers a custom element, which is a global side effect and must happen
 * exactly once. Done on mount rather than at import time so a module graph that
 * merely references this file does not touch `customElements`.
 */

let registered = false;

export function WorkingSpinner({
	size = 12,
	label,
}: {
	size?: number;
	/** What is working. Read aloud, since a spinner alone says nothing. */
	label: string;
}) {
	const [ready, setReady] = useState(registered);

	useEffect(() => {
		if (!registered) {
			ring2.register();
			registered = true;
		}
		setReady(true);
	}, []);

	// Nothing until the element exists, otherwise the browser renders an unknown
	// tag and the row jumps when it upgrades.
	if (!ready) return <span className="size-3 shrink-0" aria-hidden="true" />;

	return (
		<span
			role="status"
			aria-label={label}
			title={label}
			className="flex size-3 shrink-0 items-center justify-center"
		>
			<l-ring-2
				size={String(size)}
				stroke="2"
				stroke-length="0.25"
				// The track is the same colour as the thumb at a fraction of its
				// opacity. Kept clearly visible so the ring reads as a ring rather
				// than a lone arc chasing itself around empty space.
				bg-opacity="0.25"
				speed="0.9"
				// Follows the console's ink rather than a fixed colour, so it reads
				// the same as the text beside it in either theme.
				color="rgb(var(--console-ink) / 0.55)"
			/>
		</span>
	);
}
