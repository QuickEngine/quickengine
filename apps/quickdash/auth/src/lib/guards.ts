import { authClient } from "@quickengine/auth/client";

/**
 * Preconditions for the screens that are only reachable partway through a flow.
 *
 * 🔴 These run in `beforeLoad`, NOT in the component. A check that runs after
 * render is not a guard — the screen has already been painted, and on a slow
 * connection it is on screen long enough to read. `beforeLoad` throws a redirect
 * before anything is mounted.
 *
 * What this is for: `/code`, `/secure` and `/verify` all show something that is
 * only true if you arrived by completing the step before them. Typing `/verify`
 * into the address bar used to render "Email verified" to somebody who had
 * verified nothing.
 *
 * ⚠️ This is a UX guard, not a security boundary. Nothing here protects data —
 * every one of these screens still has to ask the API for anything real, and the
 * API authorises independently. The guard stops people landing on a screen that
 * lies to them; it is not what stops them reading someone else's account.
 */
export async function hasSession(): Promise<boolean> {
	try {
		const { data } = await authClient.getSession();
		return Boolean(data?.session);
	} catch {
		// A failed session lookup is treated as no session. The alternative is
		// letting an outage open a screen that should be closed, and the cost of
		// being wrong in this direction is one extra sign-in.
		return false;
	}
}
