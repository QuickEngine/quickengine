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
					/**
					 * 🔑 The press position, so the repaint expands from the control
					 * you actually touched.
					 *
					 * 🔴 This switch called `setTheme` with no origin, so it swapped the
					 * theme instantly while the console's own palette button did the
					 * circular reveal: the same change, animated in one place and not in
					 * the other. The origin is optional on purpose, so a caller that has
					 * no sensible point to grow from simply omits it, but a real button
					 * on a page always has one.
					 */
					onClick={(event) => {
						const box = event.currentTarget.getBoundingClientRect();
						setTheme(value as Theme, {
							x: box.left + box.width / 2,
							y: box.top + box.height / 2,
						});
					}}
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
