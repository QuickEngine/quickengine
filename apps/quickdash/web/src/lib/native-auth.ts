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

/** True only inside the Tauri shell. A presence check, not a dependency. */
export const isNativeShell = (): boolean =>
	typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
): Promise<void> {
	if (!isNativeShell()) return;
	try {
		const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
		await onOpenUrl((urls) => {
			for (const raw of urls) {
				const token = new URL(raw).searchParams.get("token");
				if (!token) continue;
				try {
					localStorage.setItem(TOKEN_KEY, token);
				} catch {
					// Storage disabled; the token still works for this session.
				}
				onToken(token);
			}
		});
	} catch {
		// Plugin unavailable. The app still runs; sign-in simply will not complete,
		// which is visible rather than silent.
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
