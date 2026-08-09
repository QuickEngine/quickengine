export type AuthRedirectEnvironment = Partial<
	Record<
		| "QUICKENGINE_ACCOUNT_URL"
		| "QUICKENGINE_AUTH_URL"
		| "QUICKENGINE_WEB_URL"
		| "QUICKDASH_ADMIN_URL",
		string
	>
>;

/** Resolve a sign-out destination without allowing the auth host to become an open redirect. */
export function resolveSignOutDestination(
	redirect: string | undefined,
	env: AuthRedirectEnvironment = process.env,
): string {
	const fallback = env.QUICKENGINE_ACCOUNT_URL ?? "/";
	if (!redirect) return fallback;
	const allowed = [
		env.QUICKENGINE_ACCOUNT_URL,
		env.QUICKENGINE_WEB_URL,
		env.QUICKENGINE_AUTH_URL,
		env.QUICKDASH_ADMIN_URL,
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => new URL(value).origin);
	try {
		const candidate = new URL(redirect, fallback);
		return allowed.includes(candidate.origin) ? candidate.toString() : fallback;
	} catch {
		return fallback;
	}
}
