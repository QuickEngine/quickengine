import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

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
