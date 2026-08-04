/**
 * A customer sign-in token may only be delivered to the exact browser origin
 * registered on the key that requested it. Paths are merchant-controlled;
 * scheme, host, and port are not.
 */
export function isAllowedCustomerCallback(
	callbackUrl: string,
	allowedOrigins: readonly string[],
): boolean {
	try {
		return allowedOrigins.includes(new URL(callbackUrl).origin);
	} catch {
		return false;
	}
}
