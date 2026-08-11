/**
 * The sign-in method this browser used last.
 *
 * ⚠️ It records the method NAME and nothing else — no address, no identifier,
 * no token. "This browser last used Google" is not sensitive; "this browser last
 * used alex@company.com" would be, and on a shared machine it would be a leak.
 * Keep it that way.
 *
 * `localStorage` rather than `sessionStorage`: the whole value is remembering
 * across visits, which is exactly what a session store forgets.
 */
export type Method = "email" | "google" | "github" | "passkey" | "password";

const KEY = "quickengine.last-method";

export function setLastMethod(method: Method) {
	try {
		localStorage.setItem(KEY, method);
	} catch {
		// Private mode. The chip simply does not appear.
	}
}

export function getLastMethod(): Method | null {
	try {
		const value = localStorage.getItem(KEY);
		return value === "email" ||
			value === "google" ||
			value === "github" ||
			value === "passkey" ||
			value === "password"
			? value
			: null;
	} catch {
		return null;
	}
}
