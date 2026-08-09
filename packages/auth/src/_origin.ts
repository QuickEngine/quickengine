// Pure origin-allow logic for the auth API's CORS check. Dependency-free on
// purpose so it can be unit-tested without booting Better Auth or the database.
//
// An origin is allowed if it's in the explicit allow list, or (when a shared
// cookie domain is configured) if it's a subdomain of that domain. The leading
// dot in the suffix check is load-bearing: it forces a real subdomain boundary,
// so look-alikes like `quickengine.xyz.evil.com` or `notquickengine.xyz` fail.
export function matchOrigin(
	origin: string | null | undefined,
	allowList: readonly (string | undefined)[],
	cookieDomain: string | undefined,
): boolean {
	if (!origin) {
		return false;
	}
	if (allowList.includes(origin)) {
		return true;
	}
	if (!cookieDomain) {
		return false;
	}
	const bare = cookieDomain.replace(/^\./, "");
	let parsed: URL;
	try {
		parsed = new URL(origin);
	} catch {
		return false;
	}
	// Cross-subdomain production cookies are Secure. Trusting an HTTP, FTP, or
	// non-default-port sibling as an auth origin would widen CSRF/CORS trust to a
	// surface that cannot legitimately participate in that production session.
	if (parsed.protocol !== "https:" || parsed.port) return false;
	const host = parsed.hostname;
	return host === bare || host.endsWith(`.${bare}`);
}
