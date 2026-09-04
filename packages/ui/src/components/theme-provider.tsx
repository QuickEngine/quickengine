import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { flushSync } from "react-dom";

/**
 * Theme: light / dark / system, persisted, with the class toggled on `<html>`.
 *
 * Shared by every app — switching theme in QuickDash carries to Account and the
 * marketing site. They are one product on one parent domain, and a theme that
 * resets when you cross a subdomain reads as a bug.
 *
 * 🔴 **A COOKIE, not `localStorage`.** The shared key was never enough:
 * `localStorage` is partitioned by ORIGIN, so `quickdash.xyz` and
 * `account.quickdash.xyz` each kept their own copy and the theme reset on every
 * hop between them. Locally it is worse — `localhost:3001` and `localhost:3011`
 * are different origins too, so it never carried in development either. Cookies
 * are scoped by domain and ignore the port, so one written on `.quickdash.xyz`
 * (or on plain `localhost`) is read by all of them.
 *
 * `localStorage` is still written, purely so an already-themed browser keeps its
 * choice on the first load after this change rather than snapping back to dark.
 *
 * Replaces `next-themes`, which is Next-specific. The behaviour is the same and
 * small enough not to warrant a dependency.
 *
 * **The flash of the wrong theme is handled in `index.html`**, not here — a script
 * there sets the class before first paint, because any React-level fix necessarily
 * runs after the browser has already painted. That script reads the same cookie,
 * so it must stay in step with this file.
 */
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "quickengine-theme";

/** The parent domain the cookie is written on, so every subdomain shares it.
 *
 * `localhost` and bare IPs get no `domain` attribute at all — a cookie domain of
 * `localhost` is rejected by browsers, which would leave development with no
 * persistence whatsoever. */
const cookieDomain = () => {
	const host = window.location.hostname;
	if (host === "localhost" || /^[\d.]+$/.test(host)) return "";
	const parts = host.split(".");
	return parts.length > 2 ? `; domain=.${parts.slice(-2).join(".")}` : "";
};

const readCookie = (): Theme | null => {
	const match = document.cookie.match(
		new RegExp(`(?:^|; )${STORAGE_KEY}=([^;]*)`),
	);
	const value = match?.[1];
	return value === "light" || value === "dark" || value === "system"
		? value
		: null;
};

const writeCookie = (theme: Theme) => {
	// One year, `Lax` so a cross-subdomain navigation still sends it.
	// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is async and not supported in Safari; the theme must be written synchronously so the value is present before the next paint
	document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax${cookieDomain()}${
		window.location.protocol === "https:" ? "; secure" : ""
	}`;
};

/** Where on screen the switch was pressed, so the repaint starts from it. */
export type ThemeOrigin = { x: number; y: number };

const ThemeContext = createContext<{
	theme: Theme;
	setTheme: (theme: Theme, origin?: ThemeOrigin) => void;
}>({ theme: "dark", setTheme: () => {} });

/**
 * The repaint.
 *
 * 🔴 Switching theme used to be a hard cut: every surface, every shadow and
 * every piece of text changed colour in one frame, and because they do not all
 * repaint together it read as the console flickering rather than as a setting
 * being applied. A view transition captures the screen before and after and
 * lets the new one be revealed, so what you see is the theme being PAINTED on,
 * from wherever you pressed.
 *
 * ⚠️ Only the reveal is animated. Cross fading the two snapshots as well would
 * put the old theme's text on the new theme's ground for a few hundred
 * milliseconds, which is the exact unreadable frame this is meant to remove.
 * The old snapshot holds still underneath and the new one is clipped over it;
 * `globals.css` turns the default cross fade off.
 */
const paint = (commit: () => void, origin?: ThemeOrigin) => {
	const start = (
		document as Document & {
			startViewTransition?: (run: () => void) => { ready: Promise<void> };
		}
	).startViewTransition;
	// No support (Safari before 18, Firefox), or somebody has asked for less
	// motion: apply it instantly. The setting must never depend on the animation.
	if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		commit();
		return;
	}
	const transition = start.call(document, commit);
	const x = origin?.x ?? window.innerWidth / 2;
	const y = origin?.y ?? window.innerHeight / 2;
	// Reach the furthest corner, or the circle stops short of part of the page.
	const radius = Math.hypot(
		Math.max(x, window.innerWidth - x),
		Math.max(y, window.innerHeight - y),
	);
	void transition.ready.then(() => {
		document.documentElement.animate(
			{
				clipPath: [
					`circle(0px at ${x}px ${y}px)`,
					`circle(${radius}px at ${x}px ${y}px)`,
				],
			},
			{
				duration: 520,
				easing: "cubic-bezier(0.22, 1, 0.36, 1)",
				pseudoElement: "::view-transition-new(root)",
			},
		);
	});
};

const systemPrefersDark = () =>
	window.matchMedia("(prefers-color-scheme: dark)").matches;

const applyTheme = (theme: Theme) => {
	const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.classList.toggle("light", !dark);
};

export function ThemeProvider({ children }: { children: ReactNode }) {
	// Nobody has chosen yet: follow the operating system rather than imposing dark
	// on someone whose machine is set to light.
	const [theme, setThemeState] = useState<Theme>(
		() =>
			readCookie() ??
			(localStorage.getItem(STORAGE_KEY) as Theme | null) ??
			"system",
	);

	useEffect(() => {
		applyTheme(theme);
		// Also on mount, which migrates a browser that only has the old
		// `localStorage` value onto the cookie the other apps can read.
		writeCookie(theme);
		if (theme !== "system") return;
		// Only while following the OS: react to the user changing it mid-session.
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme]);

	const setTheme = useCallback((next: Theme, origin?: ThemeOrigin) => {
		paint(() => {
			writeCookie(next);
			localStorage.setItem(STORAGE_KEY, next);
			/**
			 * 🔴 `flushSync` and an eager `applyTheme`, both inside the callback.
			 *
			 * A view transition snapshots the page the moment this function
			 * returns. React would batch the state update to a later frame and the
			 * class flip happens in an effect after that, so the "after" snapshot
			 * would be captured with the OLD theme still on `<html>` and the
			 * animation would reveal a copy of what was already there.
			 */
			flushSync(() => setThemeState(next));
			applyTheme(next);
		}, origin);
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => useContext(ThemeContext);
