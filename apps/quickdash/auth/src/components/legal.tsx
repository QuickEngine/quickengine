import { env } from "@/lib/env";

/**
 * The legal line, pinned to the bottom of the auth screens.
 *
 * ⚠️ Sign-up carries the consent sentence, sign-in does not — and that
 * difference is legal rather than cosmetic. "By signing up you agree to…" is the
 * moment the agreement is formed, so it has to be visible at the point of
 * agreeing. On sign-in there is nothing new to agree to; the links are there so
 * the terms stay reachable, not to re-form a contract.
 *
 * Both point at the MARKETING site. `/terms` does not exist in the auth app, and
 * a relative link would 404 on the one page where trust is the whole product.
 */
export function Legal({ consent }: { consent?: boolean }) {
	const link =
		"text-white/55 underline decoration-white/25 underline-offset-[3px] transition-colors duration-300 hover:text-white hover:decoration-white/60";

	return (
		<p className="text-center font-body font-light text-[0.75rem] text-white/35">
			{consent ? "By signing up you agree to our " : null}
			<a href={`${env.VITE_WEB_URL}/terms`} className={link}>
				Terms of Service
			</a>
			<span className="px-1.5">•</span>
			<a href={`${env.VITE_WEB_URL}/privacy`} className={link}>
				Privacy Policy
			</a>
		</p>
	);
}
