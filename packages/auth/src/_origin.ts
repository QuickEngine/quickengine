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
	let host: string;
	try {
		host = new URL(origin).hostname;
	} catch {
		return false;
	}
	return host === bare || host.endsWith(`.${bare}`);
}
