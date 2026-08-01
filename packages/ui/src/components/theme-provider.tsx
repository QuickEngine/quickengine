import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

/**
 * Theme: light / dark / system, persisted, with the class toggled on `<html>`.
 *
 * Shared by every app, and the storage key is shared too — so switching theme in
 * QuickDash carries to Account and the marketing site. They are one product on
 * one parent domain, and a theme that resets when you cross a subdomain reads as
 * a bug.
 *
 * Replaces `next-themes`, which is Next-specific. The behaviour is the same and
 * small enough not to warrant a dependency.
 *
 * **The flash of the wrong theme is handled in `index.html`**, not here — a script
 * there sets the class before first paint, because any React-level fix necessarily
 * runs after the browser has already painted.
 */
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "quickengine-theme";

const ThemeContext = createContext<{
	theme: Theme;
	setTheme: (theme: Theme) => void;
}>({ theme: "dark", setTheme: () => {} });

const systemPrefersDark = () =>
	window.matchMedia("(prefers-color-scheme: dark)").matches;

const applyTheme = (theme: Theme) => {
	const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.classList.toggle("light", !dark);
};

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(
		() => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "dark",
	);

	useEffect(() => {
		applyTheme(theme);
		if (theme !== "system") return;
		// Only while following the OS: react to the user changing it mid-session.
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme]);

	const setTheme = useCallback((next: Theme) => {
		localStorage.setItem(STORAGE_KEY, next);
		setThemeState(next);
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => useContext(ThemeContext);
