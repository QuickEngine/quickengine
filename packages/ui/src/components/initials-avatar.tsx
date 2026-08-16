function initials(label: string): string {
	const words = label.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function InitialsAvatar({
	label,
	className,
}: {
	label: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={`inline-flex items-center justify-center rounded-full bg-[rgb(var(--console-ink)/0.16)] font-medium text-[10px] text-[var(--ink-75)] ${className ?? ""}`}
		>
			{initials(label)}
		</span>
	);
}
