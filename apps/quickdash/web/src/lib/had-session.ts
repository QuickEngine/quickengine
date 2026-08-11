/**
 * Whether this browser has ever held a confirmed session.
 *
 * ⚠️ It exists to tell two identical-looking cases apart. The route guard fires
 * both when a session has expired AND when someone has simply never signed in —
 * `getSession` returns nothing either way. Telling a first-time visitor "your
 * session ended" is a lie that reads as a bug, so the message is only claimed
 * when this marker is present.
 *
 * `localStorage`, not a cookie: it must survive the session cookie being
 * cleared, which is the exact circumstance it is reporting on.
 *
 * It carries no identity and no token — a single boolean about this browser.
 */
const KEY = "quickengine.had-session";

export function markHadSession() {
	try {
		localStorage.setItem(KEY, "1");
	} catch {
		// Private mode. The cost is a slightly vaguer message, nothing more.
	}
}

export function hadSession(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

export function clearHadSession() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing to do.
	}
}
