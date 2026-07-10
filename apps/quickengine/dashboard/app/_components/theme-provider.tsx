"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// Theme context for the dashboard: light / dark / system, persisted, with the
// class toggled on <html>. Defaults to dark (the app is dark-first) and follows
// the OS when set to system. .light overrides live in brand.css.
export function ThemeProvider({ children }: { children: ReactNode }) {
	return (
		<NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
			{children}
		</NextThemesProvider>
	);
}
