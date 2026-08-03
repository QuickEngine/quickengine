import { ComputerTowerIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Logo, type Theme, useTheme } from "@quickengine/ui";
import { useEffect, useState } from "react";

/** Cycle order. `system` stays in the rotation because it is a real preference —
    drop it and anyone who wants the OS to decide has to keep correcting the
    site every time it guesses. */
const THEMES = [
	{ value: "light", label: "Light", Icon: SunIcon },
	{ value: "dark", label: "Dark", Icon: MoonIcon },
	{ value: "system", label: "System", Icon: ComputerTowerIcon },
] as const;

/**
 * One button that advances through the three modes.
 *
 * Shows `dark` until mounted: the resolved theme depends on `localStorage` and
 * `matchMedia`, neither of which exists on the first render pass, and flashing
 * the wrong icon for a frame is worse than a stable default.
 */
function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	const active = mounted ? (theme ?? "system") : "dark";
	const index = Math.max(
		0,
		THEMES.findIndex((option) => option.value === active),
	);
	const current = THEMES[index] ?? THEMES[1];
	const next = THEMES[(index + 1) % THEMES.length] ?? THEMES[0];
	const Icon = current.Icon;

	return (
		<button
			type="button"
			// Names the state AND what the click does — an icon alone leaves a
			// screen-reader user with no way to know either.
			aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
			onClick={() => setTheme(next.value as Theme)}
			className="btn btn-muted flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>
			<Icon size={13} />
		</button>
	);
}

/**
 * The year is resolved in Alberta's timezone, not the visitor's. A copyright
 * notice is a legal statement by QuickEngine Software, which is an Alberta
 * general partnership — so it should roll over when the year turns *here*, not
 * when it turns in Auckland. `America/Edmonton` also handles the MST/MDT switch
 * on its own, which a fixed offset would not.
 */
const year = new Intl.DateTimeFormat("en-CA", {
	year: "numeric",
	timeZone: "America/Edmonton",
}).format(new Date());

/**
 * Sits below the fold by design: pages fill at least one viewport, so the
 * footer is only reached by scrolling past it. Nothing here is pinned or
 * sticky — it is the end of the document, not an overlay.
 */
export function SiteFooter() {
	return (
		<footer>
			{/* Flex column so the bottom row is pushed to the bottom edge rather
			    than sitting wherever the content above happens to end. */}
			<div className="page-gutter flex min-h-96 flex-col py-10">
				{/* Same lockup as the header, deliberately identical: mark, 6px, and
				    the name at 14px. Two versions of a wordmark on one page is the
				    kind of drift nobody notices until it looks cheap. */}
				<a
					href="/"
					aria-label="QuickEngine home"
					className="flex w-fit items-center gap-1.5 rounded-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Logo className="size-6" />
					<span className="font-display text-[14px] leading-none tracking-tight">
						QuickEngine
					</span>
				</a>

				<div className="mt-auto flex items-center justify-between gap-6 pt-16">
					<p className="text-[13px] text-muted-foreground">
						© {year} QuickEngine Software. All rights reserved.
					</p>
					<ThemeToggle />
				</div>
			</div>
		</footer>
	);
}
