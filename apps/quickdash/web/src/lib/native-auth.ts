/**
 * Sign-in for the native shell.
 *
 * 🔑 Why any of this exists. Google actively degrades — and can outright block —
 * OAuth inside an embedded webview, as an anti-phishing measure. So the desktop
 * app cannot sign in inside itself. It opens the SYSTEM browser, the user
 * authenticates there, and the session has to come back across a process
 * boundary.
 *
 * A cookie cannot make that trip: it belongs to the browser that received it.
 * The API's `/api/auth-native-handoff` therefore redirects to `quickdash://auth`
 * with the session token attached, the shell catches it, and every request from
 * then on carries `Authorization: Bearer` instead of a cookie. Same session,
 * different transport — which is exactly what Better Auth's `bearer()` plugin is
 * for.
 *
 * ⚠️ This module is imported by the browser build too. Every export checks for
 * the shell first and no-ops outside it, and nothing here imports a Tauri
 * package at module scope — `NATIVE_CLIENTS.md` requires no Tauri-only APIs in
 * shared code.
 */

const TOKEN_KEY = "quickengine-native-token";
/** The last deep link acted on, so a reload does not act on it again. */
const HANDLED_KEY = "quickengine-native-handled";

/** The marker appended to the shell's user agent. See `tauri.conf.json`. */
const SHELL_MARKER = "QuickDashDesktop/";

/**
 * True only inside the Tauri shell.
 *
 * 🔴 The USER AGENT first, and the injected global second.
 *
 * `__TAURI_INTERNALS__` is injected per page, only into origins the capability
 * allows. The moment the shell navigated anywhere else the check went false and
 * the app decided it was an ordinary browser: the root route then sent it to
 * `auth.quickdash.xyz` and signed in inside the embedded webview, which is the
 * one thing the shell must never do because Google degrades and can refuse OAuth
 * there. The result was a window that bounced between the app and the browser
 * forever without ever completing.
 *
 * A user agent travels with every navigation and every origin, so the shell
 * stays identifiable even on a page it was never meant to reach. The global is
 * kept as a fallback for any build whose user agent has not been set.
 */
export const isNativeShell = (): boolean => {
	if (typeof window === "undefined") return false;
	if (
		typeof navigator !== "undefined" &&
		navigator.userAgent.includes(SHELL_MARKER)
	) {
		return true;
	}
	return "__TAURI_INTERNALS__" in window;
};

/**
 * The stored bearer token, if the shell has one.
 *
 * `localStorage` rather than memory: the alternative is re-authenticating on
 * every launch, which is worse than the risk here — the shell renders one
 * trusted origin, so there is no third-party script to read it.
 */
export const getNativeToken = (): string | null => {
	if (!isNativeShell()) return null;
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
};

/**
 * The `Authorization` header for the shell, or nothing.
 *
 * Spread into a fetch's headers. Returning `{}` rather than `undefined` means a
 * caller never has to branch — the browser simply sends no extra header and its
 * cookie does the work.
 */
export const nativeAuthHeaders = (): Record<string, string> => {
	const token = getNativeToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
};

export const clearNativeToken = (): void => {
	try {
		localStorage.removeItem(TOKEN_KEY);
	} catch {
		// Storage disabled. Nothing to clear.
	}
};

/**
 * Start listening for the `quickdash://auth?token=…` callback.
 *
 * Imported dynamically so the Tauri package is never pulled into the browser
 * bundle. Returns without doing anything outside the shell.
 */
export async function listenForNativeAuth(
	onToken: (token: string) => void,
	onFailure?: (reason: string) => void,
): Promise<void> {
	if (!isNativeShell()) return;

	/**
	 * 🔴 The `error` is read, not just the token.
	 *
	 * `/api/auth-native-handoff` answers `quickdash://auth?error=no_session` when
	 * the browser finished the provider flow without a session, and
	 * `auth-native-start` answers `bad_provider`, `no_provider_url` or
	 * `start_failed`. This listener only ever looked for `token`, so every one of
	 * those was DROPPED: the shell went back to its sign-in screen having been
	 * told exactly what went wrong, and the person saw a silent loop between the
	 * app and the browser with nothing to act on.
	 */
	const handle = (raw: string) => {
		/**
		 * 🔴 ONCE per callback, and this is what made the window flash.
		 *
		 * `getCurrent()` returns the URL the app was LAUNCHED with, and it keeps
		 * returning it: it is not consumed by reading it. Both branches below end
		 * in `window.location.replace`, so the reload ran this again, got the same
		 * URL, and replaced again — a loading screen looping several times a
		 * second.
		 *
		 * ⚠️ `sessionStorage`, not `localStorage`. The mark has to survive a reload
		 * and must NOT survive a relaunch, or a second sign-in attempt in a later
		 * session would be ignored as already handled.
		 */
		try {
			if (sessionStorage.getItem(HANDLED_KEY) === raw) return;
			sessionStorage.setItem(HANDLED_KEY, raw);
		} catch {
			// Storage disabled. Handling twice is better than not at all.
		}
		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			return;
		}
		const token = url.searchParams.get("token");
		if (token) {
			try {
				localStorage.setItem(TOKEN_KEY, token);
			} catch {
				// Storage disabled; the token still works for this session.
			}
			onToken(token);
			return;
		}
		onFailure?.(url.searchParams.get("error") ?? "no_token");
	};

	try {
		const { getCurrent, onOpenUrl } = await import(
			"@tauri-apps/plugin-deep-link"
		);
		/**
		 * 🔴 The URL that LAUNCHED the app, as well as ones delivered later.
		 *
		 * `onOpenUrl` only fires while the app is already running. If the shell is
		 * not running when the browser hands the callback over — or if the OS
		 * starts a fresh instance rather than waking the existing one — the
		 * callback arrives as a launch argument and no listener ever sees it. That
		 * is the same silent loop from the other direction.
		 */
		const launched = await getCurrent();
		if (launched) for (const raw of launched) handle(raw);
		await onOpenUrl((urls) => {
			for (const raw of urls) handle(raw);
		});
	} catch {
		/* 🔴 REPORTED, not swallowed. The old comment here claimed the failure was
		   "visible rather than silent" while this block discarded it, so a missing
		   or unpermitted plugin looked identical to a sign-in that simply never
		   completed. */
		onFailure?.("deep_link_unavailable");
	}
}

/**
 * Open a provider sign-in in the system browser.
 *
 * `/api/auth-native-start` rather than Better Auth's own endpoint: that one is a
 * POST returning JSON, and all this can do is hand the browser a URL. The server
 * makes the call, follows the answer, and fixes the callback — nothing about
 * where sign-in ends up is decided here, where a compromised renderer could
 * change it.
 */
export async function startNativeSignIn(
	authUrl: string,
	provider: "google" | "github",
): Promise<void> {
	const target = `${authUrl}/api/auth-native-start?provider=${provider}`;
	const { openUrl } = await import("@tauri-apps/plugin-opener");
	await openUrl(target);
}

/**
 * Tell the document it is inside the shell, so the layout can leave room for
 * the window's own controls.
 *
 * 🔴 macOS draws its close, minimise and zoom buttons OVER the page: the window
 * is configured with an overlay title bar and no title, which is what makes the
 * app look like one surface instead of a web page under a grey strip. The cost
 * is that the top-left eighty pixels belong to the operating system, and the
 * workspace switcher was sitting underneath them — reduced to a "?" with the
 * traffic lights on top of it.
 *
 * ⚠️ Marked on the ROOT element rather than handled in a component. The rule is
 * about where the operating system draws, not about what any one component is,
 * and every surface that ever puts something top-left needs the same answer.
 *
 * ⚠️ Windows and Linux put their controls on the RIGHT and are not overlaid by
 * default, so they get their own value rather than sharing this one. Getting
 * that wrong indents the wrong side and looks like a bug on the platform that
 * did not need the fix.
 */
export function markNativeShell(): void {
	if (typeof document === "undefined" || !isNativeShell()) return;
	const platform =
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.userAgent)
			? "macos"
			: "other";
	document.documentElement.dataset.shell = platform;
}
