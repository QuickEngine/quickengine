import { useSearch } from "@tanstack/react-router";
import { resolveDestination } from "./destination";

/**
 * Where to send the user after authenticating.
 *
 * The `?redirect=` target when it points at one of our own apps, otherwise the
 * account dashboard. Kept in the URL so it survives the OAuth round-trip and a
 * refresh, and shares its open-redirect guard with every other caller via
 * `resolveDestination`.
 *
 * Replaces `nuqs`, which only works inside Next. TanStack Router already owns
 * search params.
 */
export function useAuthDestination(): string {
	const search = useSearch({ strict: false }) as { redirect?: unknown };
	return resolveDestination(
		typeof search.redirect === "string" ? search.redirect : null,
	);
}
