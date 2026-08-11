import {
	ArrowRightIcon,
	ArrowUpRightIcon,
	CaretDownIcon,
} from "@phosphor-icons/react";

/**
 * The pill button pair, and the two colours that define them.
 *
 * These live in one module because the header and the hero both render them —
 * the hexes were briefly duplicated across two files, which is exactly how a
 * palette drifts once a third surface copies whichever one it happened to see.
 *
 * Literal hex rather than theme tokens on purpose, for now: they are being
 * chosen by eye, and routing them through the ramp would mean every adjustment
 * moves the rest of the palette with it. They become tokens once they settle.
 *
 * The secondary was #959595 and sat too light — against a black page it read as
 * loud as the primary, so the pair had no order to it. #3C4247 is dark enough to
 * recede and carries a little of the gradient's blue so both buttons feel like
 * they belong to the same page. Ice text on it is 7.8:1, past AAA.
 */
// Re-exported so every existing import keeps working — the values themselves
// now live in `@quickengine/ui` so the auth app reads the same two.
// Imported for use below AND re-exported, so every existing
// `from "@/components/pill"` import keeps working while the values themselves
// live in `@quickengine/ui` — where the auth app reads the same two.
import { GREY, ICE } from "@quickengine/ui";

export { GREY, ICE };

type PillBase = {
	variant: "primary" | "secondary";
	/** `sm` is the header pair; `lg` is the hero pair. */
	size?: "sm" | "lg";
	/**
	 * Trailing black disc. The glyph is the only difference between them, and
	 * each one means something specific — keep it that way, or they stop being
	 * information and become decoration:
	 *
	 * - `arrow`  — continues on this site
	 * - `launch` — leaves for the product
	 * - `caret`  — opens a menu
	 *
	 * Putting the glyph INSIDE the disc rather than beside it keeps every button
	 * to a single indicator.
	 */
	disc?: "arrow" | "launch" | "caret";
	/** Full width below `sm`. The hero pair stacks; the header pair does not. */
	block?: boolean;
	children: React.ReactNode;
};

/**
 * Either a destination or an action, never both and never neither.
 *
 * ⚠️ The union is what keeps this honest. The 500 page needs a pill that calls
 * `reset()` rather than navigating, and the first version of it hand-copied
 * every class off this file into a bare `<button>`. That works exactly until
 * someone changes a pill height here and the one control that most needs to look
 * native stops matching — which is the drift the alignment rule exists to stop.
 */
type PillProps =
	| (PillBase & { href: string; onClick?: never })
	| (PillBase & { onClick: () => void; href?: never });

// Weight is Leicht at both sizes. The ice fill is already saying which one is
// the action — adding weight on top of it makes the pair shout.
const SIZES = {
	// ⚠️ 36px, matching the auth app's top-right button. Auth is the master for
	// this control: it is the only place the button appears alone, so it sets the
	// size everything else follows. It was 32px here and the two bars visibly
	// disagreed when you moved between them.
	sm: "h-9 px-4 text-[13px]",
	lg: "h-11 px-6 text-[15px]",
} as const;

// With a disc on the trailing edge the RIGHT padding drops to match the inset
// the disc already provides — keeping the full padding would leave the disc
// floating well inside the pill and the whole thing looking loose.
const ARROW_SIZES = {
	sm: "h-9 ps-4 pe-1 text-[13px]",
	lg: "h-11 ps-6 pe-1.5 text-[15px]",
} as const;

const DISC = {
	sm: { box: "size-7", icon: 13 },
	lg: { box: "size-8", icon: 15 },
} as const;

export function Pill({
	href,
	onClick,
	variant,
	size = "sm",
	disc,
	block = false,
	children,
}: PillProps) {
	const primary = variant === "primary";
	const size_ = DISC[size];
	const Glyph =
		disc === "caret"
			? CaretDownIcon
			: disc === "launch"
				? ArrowUpRightIcon
				: ArrowRightIcon;

	// Identical between the two elements — see the note on `PillProps`. A button
	// also needs `type` so it cannot submit a form it happens to sit inside.
	const Element = onClick ? "button" : "a";

	return (
		<Element
			href={onClick ? undefined : href}
			onClick={onClick}
			type={onClick ? "button" : undefined}
			style={
				primary
					? { backgroundColor: ICE, color: "#000000" }
					: { backgroundColor: GREY, color: ICE }
			}
			// Duration is asymmetric on purpose: 150ms out so it answers the cursor
			// immediately, 300ms back so it settles rather than snapping. Focus gets
			// the same treatment as hover, so keyboard navigation is not left
			// without feedback.
			// Centred as a group: the label sits in the middle and the disc sits
			// immediately after it. NOT `justify-between`, which pushes the label to
			// the far left as well, and NOT an absolutely positioned disc, which
			// escapes the button entirely if anything upstream forgets `relative`.
			className={`inline-flex items-center justify-center rounded-full font-body font-light leading-none no-underline transition-opacity duration-300 ease-out hover:opacity-85 hover:duration-150 focus-visible:opacity-85 ${block ? "max-sm:w-full" : ""} ${disc ? ARROW_SIZES[size] : SIZES[size]}`}
		>
			{children}
			{disc ? (
				// aria-hidden and no label: the disc is decoration on a link that
				// already says where it goes, so announcing "arrow" would only add
				// noise for a screen reader.
				<span
					aria-hidden="true"
					className={`ms-2.5 inline-flex shrink-0 items-center justify-center rounded-full bg-black ${size_.box}`}
				>
					<Glyph size={size_.icon} color={ICE} weight="bold" />
				</span>
			) : null}
		</Element>
	);
}
