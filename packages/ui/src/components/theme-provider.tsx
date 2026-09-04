import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
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
/**
 * ⚠️ `slate` is a DARK theme, not a third kind of thing. Everywhere this type is
 * checked, ask "is it dark?" rather than "is it `dark`?" — the one place that
 * matters is `applyTheme`, which is why the check lives there and nowhere else.
 */
/** Light, dark, or follow the machine. Nothing else belongs on this axis. */
export type Theme = "light" | "dark" | "system";

/**
 * The colour families. `neutral` is the base every other one layers on, so it
 * has no class of its own.
 *
 * 🔑 Independent of light and dark. Somebody who prefers Sepia keeps Sepia when
 * their machine switches to light in the evening, which is the whole reason
 * these are two axes and not one list of "ocean" and "ocean light".
 */
export const PALETTES = [
	"neutral",
	"obsidian",
	"abyss",
	"void",
	"sandstone",
	"linen",
	"concrete",
	"gloaming",
	"harvest",
	"lagoon",
	"tundra",
	"aubergine",
	"driftwood",
	"pewter",
	"sage",
	"ultraviolet",
	"inferno",
	"acid",
	"flamingo",
	"cyber",
	"fog",
	"dune",
	"juniper",
	"plumsmoke",
	"cinder",
	"emerald",
	"sapphire",
	"ruby",
	"topaz",
	"amethyst",
	"crt",
	"polaroid",
	"typewriter",
	"oxide",
	"glacier",
	"monsoon",
	"savanna",
	"canyon",
	"reef",
	"meadow",
	"thunder",
	"aurora",
	"espresso",
	"matcha",
	"honey",
	"mulberry",
	"outrun",
	"arcade",
	"blueprint",
	"peacock",
	"parchment",
] as const;

export type Palette = (typeof PALETTES)[number];

const PALETTE_KEY = "quickengine-palette";

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
	palette: Palette;
	setPalette: (palette: Palette, origin?: ThemeOrigin) => void;
}>({
	theme: "dark",
	setTheme: () => {},
	palette: "neutral",
	setPalette: () => {},
});

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

const applyTheme = (theme: Theme, palette: Palette) => {
	const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.classList.toggle("light", !dark);
	/**
	 * 🔴 `slate` sits ON TOP of `dark`, both classes at once. It restates only
	 * the grounds and surfaces; everything derived from them comes from the dark
	 * theme underneath, so the two can never drift apart the way two independent
	 * palettes would.
	 */
	/**
	 * 🔴 The family sits ON TOP of the mode, both classes at once. Each palette
	 * restates only the grounds and surfaces; everything derived from them comes
	 * from light or dark underneath, so a family can never drift out of step
	 * with the theme it is layered on.
	 */
	for (const family of PALETTES) {
		document.documentElement.classList.toggle(
			family,
			family !== "neutral" && family === palette,
		);
	}
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
	const [palette, setPaletteState] = useState<Palette>(() => {
		// Storage throws outright in a few real cases; a colour preference is
		// never worth failing to render over.
		try {
			const saved = localStorage.getItem(PALETTE_KEY) as Palette | null;
			return saved && PALETTES.includes(saved) ? saved : "neutral";
		} catch {
			return "neutral";
		}
	});

	/**
	 * ⚠️ A ref beside the state. `setTheme` is created once, so it would close
	 * over the palette as it was on first render and repaint into the wrong
	 * family. The ref is the live value.
	 */
	const paletteRef = useRef(palette);
	paletteRef.current = palette;

	const themeRef = useRef(theme);
	themeRef.current = theme;

	useEffect(() => {
		applyTheme(theme, palette);
		// Also on mount, which migrates a browser that only has the old
		// `localStorage` value onto the cookie the other apps can read.
		writeCookie(theme);
		if (theme !== "system") return;
		// Only while following the OS: react to the user changing it mid-session.
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system", palette);
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme, palette]);

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
			applyTheme(next, paletteRef.current);
		}, origin);
	}, []);

	const setPalette = useCallback((next: Palette, origin?: ThemeOrigin) => {
		paint(() => {
			try {
				localStorage.setItem(PALETTE_KEY, next);
			} catch {
				// It applies for this session and simply is not remembered.
			}
			flushSync(() => setPaletteState(next));
			applyTheme(themeRef.current, next);
		}, origin);
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, setTheme, palette, setPalette }}>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => useContext(ThemeContext);
