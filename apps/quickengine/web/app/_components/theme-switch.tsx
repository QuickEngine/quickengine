"use client";

import { ComputerTower, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "dark", label: "Dark", Icon: Moon },
	{ value: "system", label: "System", Icon: ComputerTower },
];

// Compact theme switch for the footer — light / dark / system, wired to
// next-themes. Guarded on mount to avoid a hydration mismatch (the server can't
// know the resolved theme, so it renders the dark default until mounted).
export function ThemeSwitch() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const active = mounted ? (theme ?? "system") : "dark";

	return (
		<div className="flex items-center gap-0.5 rounded-full border border-border p-0.5">
			{OPTIONS.map(({ value, label, Icon }) => (
				<button
					key={value}
					type="button"
					aria-label={label}
					aria-pressed={active === value}
					onClick={() => setTheme(value)}
					className={`flex size-7 items-center justify-center rounded-full transition-colors ${
						active === value
							? "bg-foreground/10 text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					<Icon className="size-4" />
				</button>
			))}
		</div>
	);
}
