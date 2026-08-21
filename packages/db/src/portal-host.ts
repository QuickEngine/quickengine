/**
 * Hostname normalisation for custom portal domains.
 *
 * ⚠️ **Pure on purpose — this file must never import `./client` or anything that
 * reaches a database.** It lives apart from `workspace-branding.ts` for exactly
 * one reason: so its tests can run without `DATABASE_URL`. Importing the branding
 * module pulls in the connection, whose env schema then fails validation in CI
 * where no database exists — which is precisely how this was found. Same shape as
 * `client-options.ts` and the two state-policy modules, which is the established
 * pattern for testable logic in this package.
 */

/**
 * Reduce whatever was typed to a bare hostname.
 *
 * An operator pasting a domain into a settings field types
 * `https://account.gemsutopia.ca/`, `Account.Gemsutopia.CA`, or
 * `account.gemsutopia.ca:443`. A browser sends exactly one of those forms, so
 * both sides normalise through here or the lookup silently never matches.
 *
 * Returns null for anything that is not a plausible hostname, which keeps
 * nonsense out of a UNIQUE column where it would block the real value later.
 */
export function normalizePortalHost(value: string): string | null {
	let host = value.trim().toLowerCase();
	if (!host) return null;

	// Tolerate a full URL.
	if (host.includes("://")) {
		try {
			host = new URL(host).hostname;
		} catch {
			return null;
		}
	}

	/**
	 * ⚠️ Cut at the first "/" by index, not with `/\/.*$/`.
	 *
	 * That pattern is a polynomial ReDoS on a value made of many slashes, and a
	 * portal host arrives from a customer-controlled settings field. Everything
	 * after the first slash is a path and is never part of a hostname, so the
	 * index is both faster and a more honest description of the rule.
	 */
	const pathAt = host.indexOf("/");
	if (pathAt !== -1) host = host.slice(0, pathAt);
	host = host.replace(/:\d+$/, "").replace(/\.$/, "");

	// At least one dot, no spaces, no wildcards. `localhost` is deliberately
	// rejected: a custom portal domain is a public one.
	if (
		!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
			host,
		)
	) {
		return null;
	}
	return host;
}
