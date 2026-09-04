function initials(label: string): string {
	const words = label.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function InitialsAvatar({
	label,
	className,
	shape = "circle",
}: {
	label: string;
	className?: string;
	/**
	 * 🔴 An explicit prop, not a radius passed through `className`.
	 *
	 * Every caller already sends a `className` for sizing, so a defaulted
	 * `className ?? "rounded-full"` would never fire and all of them would turn
	 * square. Two competing Tailwind radius classes are worse still: they have
	 * equal specificity, so which one wins depends on their order in the
	 * generated stylesheet rather than on anything written here.
	 */
	shape?: "circle" | "squircle";
}) {
	return (
		<span
			aria-hidden="true"
			className={`inline-flex items-center justify-center bg-[rgb(var(--console-ink)/0.16)] font-medium text-[10px] text-[var(--ink-75)] ${
				/* 🔴 `rounded-md`, not `rounded-[30%]`.
				   A percentage radius scales with the box, so the same avatar was a
				   different shape at every size and matched nothing around it: at
				   28px it came out at 8.4px, which is neither the 6px of the button
				   it sits in nor a circle, and read as a lozenge wedged in a
				   square. A fixed radius agrees with the console's other corners at
				   every size.

				   5px rather than the button's 6px: a mark sitting inside a rounded
				   control wants to be a touch sharper than its container, or the
				   two radii fight and the avatar reads as bulging out of it. */
				shape === "squircle" ? "rounded-[5px]" : "rounded-full"
			} ${className ?? ""}`}
		>
			{initials(label)}
		</span>
	);
}
