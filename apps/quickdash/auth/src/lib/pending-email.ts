/**
 * The address a code was just sent to, held across a page load.
 *
 * ⚠️ `sessionStorage`, NOT the URL. `?email=you@company.com` would survive a
 * refresh just as well, and would also write a real address into browser
 * history, the referrer sent to any outbound link, and every analytics tool that
 * sees a path. This is the same resilience with none of that.
 *
 * Session-scoped rather than local: it should not outlive the tab. A shared
 * machine that remembers the last person's email on the sign-in screen is a
 * small leak with no upside.
 */
const KEY = "quickengine.pending-email";

export function setPendingEmail(email: string) {
	try {
		sessionStorage.setItem(KEY, email);
	} catch {
		// Private mode or a blocked store. The flow degrades to "start again",
		// which is survivable; throwing here would break sign-in outright.
	}
}

export function getPendingEmail(): string | null {
	try {
		return sessionStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function clearPendingEmail() {
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// Nothing to do — see above.
	}
}
