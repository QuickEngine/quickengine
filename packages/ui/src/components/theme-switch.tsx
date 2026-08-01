import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { type Theme, useTheme } from "./theme-provider";

const OPTIONS = [
	{ value: "light", label: "Light", Icon: SunIcon },
	{ value: "dark", label: "Dark", Icon: MoonIcon },
	{ value: "system", label: "System", Icon: DesktopIcon },
] as const;

/**
 * Light / dark / system, as a segmented pill.
 *
 * Three options rather than a two-way toggle: "system" is a real preference, and
 * collapsing it means someone who wants the OS to decide has to keep correcting
 * the app every time it guesses.
 *
 * Renders the dark default until mounted. The resolved theme depends on
 * `localStorage` and `matchMedia`, neither of which exists during the first
 * render pass — showing the wrong option as active for a frame is worse than
 * showing a stable default.
 */
export function ThemeSwitch({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const active = mounted ? (theme ?? "system") : "dark";

	return (
		<div
			className={`inline-flex items-center gap-0.5 rounded-full border border-edge p-0.5 ${className ?? ""}`}
		>
			{OPTIONS.map(({ value, label, Icon }) => (
				<button
					key={value}
					type="button"
					aria-label={label}
					aria-pressed={active === value}
					onClick={() => setTheme(value as Theme)}
					className={`flex size-6 items-center justify-center rounded-full transition-colors ${
						active === value ? "bg-field text-ink" : "text-dim hover:text-ink"
					}`}
				>
					<Icon size={13} />
				</button>
			))}
		</div>
	);
}
