import { useEffect, useRef, useState } from "react";

/**
 * The console's tooltip, for every `title` in the product.
 *
 * ── Why this is a layer and not a component you wrap things in ──────────────
 *
 * 🔴 There are over a hundred and fifty `title` attributes across this console.
 * Wrapping each one in a tooltip component means editing forty files to change
 * a label, hand-checking every flex row for a wrapper that broke its `gap`, and
 * relying on whoever adds the next button to remember. Discipline that has to
 * be remembered is discipline that lapses: the native `title` is exactly what
 * everybody reaches for, because it is one attribute and it works.
 *
 * 🔑 So this takes `title` seriously instead of replacing it. One listener at
 * the root reads the attribute off whatever the pointer is on, suppresses the
 * browser's version and draws ours. Every existing tooltip is upgraded at once,
 * every future `title` gets it for free, and the call sites stay as simple as
 * they already were.
 *
 * ── Why it looks like this ──────────────────────────────────────────────────
 *
 * 🔑 FLAT, and deliberately the only floating thing in the console that is.
 * Every other surface that leaves the page is raised because you can act on it:
 * a popover holds controls, a dialog holds a form, a sheet holds a record. A
 * tooltip holds four words and is gone when you look away. Relief would claim
 * it is an object, and would put a shadow on screen every time the pointer
 * crossed an icon.
 *
 * ⚠️ 400ms. Instant means a label fires while the pointer is merely crossing
 * the header on its way somewhere else, which is a console flashing words at
 * somebody who asked for nothing. The browser's own delay is about a second,
 * which is long enough that people give up first.
 */

type Shown = {
	text: string;
	/** Viewport coordinates of the element being described. */
	box: DOMRect;
};

/**
 * 🔴 `data-hint`, NOT `title`, and this is the whole reason the first version
 * did not work.
 *
 * Removing `title` when the pointer arrives is a race that cannot be won:
 * React puts the attribute straight back on the next render, because its
 * virtual DOM still says the element has one, and macOS then draws its own grey
 * tooltip underneath ours. There is no way to suppress the native one while the
 * attribute exists, so the attribute must never exist. Every DOM `title` in the
 * console was renamed; component props called `title` are untouched, since those
 * are React props and render nothing.
 *
 * ⚠️ An icon-only control still needs `aria-label`. `data-hint` is a label for
 * the eye and nothing else reads it.
 */
const ATTR = "data-hint";

export function HintLayer() {
	const [shown, setShown] = useState<Shown | null>(null);
	const timer = useRef<number | null>(null);
	const held = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const clearTimer = () => {
			if (timer.current !== null) {
				window.clearTimeout(timer.current);
				timer.current = null;
			}
		};

		const release = () => {
			held.current = null;
		};

		const hide = () => {
			clearTimer();
			release();
			setShown(null);
		};

		const consider = (target: EventTarget | null) => {
			if (!(target instanceof Element)) return;
			const element = target.closest<HTMLElement>(`[${ATTR}]`);
			// Nothing to say, or the same thing we are already saying.
			if (!element || element === held.current) {
				if (!element) hide();
				return;
			}
			const text = element.getAttribute(ATTR)?.trim();
			if (!text) return;

			hide();
			held.current = element;

			timer.current = window.setTimeout(() => {
				// It may have been unmounted or scrolled away while we waited.
				if (!element.isConnected) return hide();
				setShown({ text, box: element.getBoundingClientRect() });
			}, 400);
		};

		const onOver = (event: PointerEvent) => consider(event.target);
		const onFocus = (event: FocusEvent) => consider(event.target);
		const onKey = (event: KeyboardEvent) => {
			/**
			 * Escape dismisses, and so does typing: a label hovering over a form
			 * somebody is filling in is in the way.
			 *
			 * 🔴 Reads the REF, not the state. Depending on `shown` here is what
			 * put `shown` in the effect's dependency list, and that made the whole
			 * thing silently do nothing: showing a tooltip re-ran the effect, whose
			 * cleanup called `hide()`, which cleared it again before it could be
			 * seen. The listeners are attached once and read live values through
			 * refs.
			 */
			if (event.key === "Escape" || held.current) hide();
		};

		document.addEventListener("pointerover", onOver, true);
		document.addEventListener("pointerdown", hide, true);
		document.addEventListener("focusin", onFocus, true);
		document.addEventListener("focusout", hide, true);
		document.addEventListener("keydown", onKey, true);
		// Capture, because the console scrolls in several nested places and a
		// tooltip pinned to a stale position is worse than none.
		window.addEventListener("scroll", hide, true);
		window.addEventListener("blur", hide);

		return () => {
			document.removeEventListener("pointerover", onOver, true);
			document.removeEventListener("pointerdown", hide, true);
			document.removeEventListener("focusin", onFocus, true);
			document.removeEventListener("focusout", hide, true);
			document.removeEventListener("keydown", onKey, true);
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("blur", hide);
			hide();
		};
		// ⚠️ Attached ONCE. See the note on `onKey`.
	}, []);

	if (!shown) return null;

	// Below by default, above when the bottom of the window is close. Clamped to
	// 8px of either edge so a control near a corner still gets a readable label.
	const gap = 7;
	const below = shown.box.bottom + gap;
	const flip = below + 40 > window.innerHeight;
	const top = flip ? shown.box.top - gap : below;

	return (
		<div
			role="tooltip"
			style={{
				position: "fixed",
				// The arrow is absolutely positioned against this.
				isolation: "isolate",
				top,
				left: Math.min(
					Math.max(8, shown.box.left + shown.box.width / 2),
					window.innerWidth - 8,
				),
				transform: `translate(-50%, ${flip ? "-100%" : "0"})`,
			}}
			className="pointer-events-none z-[80] max-w-[16rem] rounded-md border border-[var(--console-line-strong)] bg-[var(--console-pop)] px-2 py-1 text-[11px] text-[var(--ink-70)] leading-[1.4]"
		>
			{shown.text}
			{/* 🔑 A rotated square with only its two OUTER edges bordered, so it
			    reads as the tooltip's own corner pulled into a point rather than a
			    diamond stuck to the side of it. Offset by half its width minus a
			    pixel, which is what tucks the unbordered half behind the panel and
			    hides the seam. */}
			<span
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "50%",
					[flip ? "bottom" : "top"]: -4,
					transform: "translateX(-50%) rotate(45deg)",
				}}
				className={`size-[7px] bg-[var(--console-pop)] ${
					flip
						? "border-[var(--console-line-strong)] border-r border-b"
						: "border-[var(--console-line-strong)] border-t border-l"
				}`}
			/>
		</div>
	);
}
