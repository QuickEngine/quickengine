/**
 * What counts as a usable email address and a usable password.
 *
 * Both were browser defaults until 2026-08-10. `type="email"` rejects `k` but
 * accepts `k@k`, and the password field carried nothing but `required` — so the
 * only floor on a password was Better Auth's undocumented default of 8
 * characters, discovered after a round trip and reported in wording nobody here
 * wrote.
 *
 * ⚠️ These rules exist in TWO places on purpose and that is not duplication to
 * be cleaned up. This file is the fast, specific, local answer that can say
 * "needs a number" while someone is still typing. `minPasswordLength` in
 * `packages/auth/src/server.ts` is the one that is actually enforced. A client
 * check is a courtesy; anything that matters is decided by the server, which
 * never sees this file. Keep the numbers in step.
 */

/** Length floor. Mirrors `minPasswordLength` on the server — change both. */
export const MIN_PASSWORD = 10;

/**
 * ⚠️ Deliberately NOT the RFC 5322 grammar. That expression is famously
 * enormous, and it still accepts addresses no mail provider will deliver to
 * while rejecting some that are technically legal. What is actually wanted here
 * is a cheap catch for the typo — a missing `@`, a bare `k`, a domain with no
 * dot in it — because the address is verified for real by whether the code
 * arrives. Anything stricter starts rejecting real people, and an address this
 * rejects is one they cannot use no matter how correct it is.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function emailProblem(value: string): string | null {
	const email = value.trim();
	if (!email) return "Enter your email address.";
	if (!EMAIL.test(email)) return "That doesn't look like an email address.";
	// Practical ceiling. The RFC allows 254; anything near it is a paste error.
	if (email.length > 254) return "That address is too long.";
	return null;
}

export type Rule = { label: string; met: boolean };

/**
 * The four classes plus a length floor.
 *
 * ⚠️ Worth knowing that composition rules like these are no longer what NIST
 * recommends — current guidance favours length and a breach-list check over
 * forced variety, because the latter reliably produces `Password1!`. They are
 * here because they are what people expect to see and what most compliance
 * checklists still ask for. If a breached-password check is ever added, it
 * belongs on the server beside `minPasswordLength`, and it would be worth more
 * than all four of these.
 */
export function passwordRules(value: string): Rule[] {
	return [
		{
			label: `At least ${MIN_PASSWORD} characters`,
			met: value.length >= MIN_PASSWORD,
		},
		{ label: "An uppercase letter", met: /[A-Z]/.test(value) },
		{ label: "A lowercase letter", met: /[a-z]/.test(value) },
		{ label: "A number", met: /\d/.test(value) },
		{ label: "A symbol", met: /[^A-Za-z0-9]/.test(value) },
	];
}

export function passwordOk(value: string): boolean {
	return passwordRules(value).every((rule) => rule.met);
}

/**
 * 0–4, for the bar.
 *
 * ⚠️ Rules met is the FLOOR, not the whole score. A password that satisfies
 * every rule at exactly the minimum length is not strong, and showing it full is
 * a lie that encourages the weakest thing this will accept. Real length is what
 * earns the top of the bar.
 */
export function passwordScore(value: string): number {
	if (!value) return 0;
	const met = passwordRules(value).filter((rule) => rule.met).length;
	let score = Math.min(3, Math.floor((met / passwordRules(value).length) * 3));
	if (passwordOk(value) && value.length >= 16) score = 4;
	else if (passwordOk(value)) score = 3;
	return score;
}
