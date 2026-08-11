import { useEffect, useRef } from "react";

/**
 * Six boxes, one per digit.
 *
 * A single field with `tracking-[0.4em]` is the cheap version of this: the
 * spacing only looks like separate digits until you type, at which point the
 * caret sits between two letter-spaced characters and the whole thing reads as
 * a text box pretending. Boxes say how many digits are expected before a single
 * one is entered, and show progress while typing.
 *
 * ⚠️ The FIRST box carries `autoComplete="one-time-code"` and the rest do not.
 * iOS and Android offer the code from the notification to exactly one field; put
 * it on all six and the platform fills the same digit six times. Everything else
 * here — paste, arrows, backspace — exists because a segmented input breaks all
 * of them by default, which is why so many of them feel awful.
 */
export function CodeInput({
	value,
	onChange,
	length = 6,
	disabled,
}: {
	value: string;
	onChange: (next: string) => void;
	length?: number;
	disabled?: boolean;
}) {
	const refs = useRef<(HTMLInputElement | null)[]>([]);

	useEffect(() => {
		refs.current[0]?.focus();
	}, []);

	const setAt = (index: number, digit: string) => {
		const next = value.split("");
		next[index] = digit;
		onChange(next.join("").slice(0, length).replace(/\D/g, ""));
	};

	return (
		// ⚠️ ONE field, six cells — not six floating boxes. A row of separate
		// inputs reads as six unrelated controls; a single bordered surface
		// divided by hairlines reads as one value that happens to have six
		// positions, which is what it is. `focus-within` lights the whole field so
		// the object being edited is the field, not the cell.
		//
		// A rectangle, not a pill. The pill was tried on 2026-08-10 and the shape
		// argued with the dividers: rounded ends say "one continuous value", the
		// hairlines say "separate segments", and the result read as a capsule that
		// had been sliced. Divider lines want straight edges to terminate on.
		<div // Full width, matching the submit button beneath it. Capping it narrower
			// left the field floating inside a column everything else fills, which
			// reads as a stray element rather than as part of the form.
			className="flex w-full overflow-hidden rounded-2xl border border-white/15 bg-black/45 backdrop-blur-sm transition-colors duration-200 focus-within:border-white/40"
		>
			{Array.from({ length }, (_, index) => {
				const key = `digit-${index}`;
				return (
					<input
						key={key}
						ref={(element) => {
							refs.current[index] = element;
						}}
						// Only the first field advertises itself to the OS autofill.
						autoComplete={index === 0 ? "one-time-code" : "off"}
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={1}
						disabled={disabled}
						aria-label={`Digit ${index + 1}`}
						value={value[index] ?? ""}
						onChange={(event) => {
							const digit = event.target.value.replace(/\D/g, "").slice(-1);
							if (!digit) return;
							setAt(index, digit);
							refs.current[index + 1]?.focus();
						}}
						onKeyDown={(event) => {
							if (event.key === "Backspace") {
								event.preventDefault();
								// Clearing a filled box stays put; clearing an empty one steps
								// back. Without this, backspace on an empty box does nothing
								// and the only way out is the mouse.
								if (value[index]) {
									setAt(index, "");
								} else {
									refs.current[index - 1]?.focus();
									setAt(index - 1, "");
								}
							}
							if (event.key === "ArrowLeft") refs.current[index - 1]?.focus();
							if (event.key === "ArrowRight") refs.current[index + 1]?.focus();
						}}
						onPaste={(event) => {
							// Pasting a whole code is how most people enter one. Without
							// this it lands entirely in the box that happened to be focused.
							event.preventDefault();
							const pasted = event.clipboardData
								.getData("text")
								.replace(/\D/g, "")
								.slice(0, length);
							if (!pasted) return;
							onChange(pasted);
							refs.current[Math.min(pasted.length, length - 1)]?.focus();
						}}
						onFocus={(event) => event.target.select()}
						className={`h-[4.5rem] min-w-0 flex-1 bg-transparent text-center font-display font-light text-[1.625rem] text-white outline-none transition-colors duration-200 focus:bg-white/[0.06] disabled:opacity-50 ${
							index === 0 ? "" : "border-white/12 border-l"
						}`}
					/>
				);
			})}
		</div>
	);
}
