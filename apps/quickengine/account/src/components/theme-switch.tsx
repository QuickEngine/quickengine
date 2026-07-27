"use client";

import { ComputerTower, Moon, Sun } from "@phosphor-icons/react";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@quickengine/ui/components/ui/toggle-group";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Theme switch: light (sun) / dark (moon) / system (computer tower). Wired to
// next-themes — selecting a mode applies it immediately and persists. System
// follows the OS. Guarded on mount to avoid a hydration mismatch (the server
// can't know the resolved theme).
export function ThemeSwitch() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			value={mounted ? (theme ?? "system") : "dark"}
			onValueChange={(value) => value && setTheme(value)}
			aria-label="Theme"
		>
			<ToggleGroupItem value="light" aria-label="Light">
				<Sun className="size-4" />
			</ToggleGroupItem>
			<ToggleGroupItem value="dark" aria-label="Dark">
				<Moon className="size-4" />
			</ToggleGroupItem>
			<ToggleGroupItem value="system" aria-label="System">
				<ComputerTower className="size-4" />
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
