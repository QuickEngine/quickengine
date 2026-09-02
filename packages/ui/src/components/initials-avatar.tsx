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
				shape === "squircle" ? "rounded-[30%]" : "rounded-full"
			} ${className ?? ""}`}
		>
			{initials(label)}
		</span>
	);
}
