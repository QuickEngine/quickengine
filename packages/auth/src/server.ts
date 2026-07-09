import { passkey } from "@better-auth/passkey";
import { db } from "@quickengine/db";
import {
	quickengineAccounts,
	quickenginePasskeys,
	quickengineSessions,
	quickengineTwoFactors,
	quickengineUsers,
	quickengineVerifications,
} from "@quickengine/db/schema/quickengine";
import { getEmailProvider } from "@quickengine/email";
import { serverEnv } from "@quickengine/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer, emailOTP, magicLink, twoFactor } from "better-auth/plugins";

// The QuickEngine surfaces that are allowed to talk to this auth authority.
// On localhost every port shares the `localhost` cookie, so a single session
// works across web/admin/auth in dev. In production on *.vercel.app cookies
// can't be shared across subdomains (public-suffix list) — that's handled by
// the token/redirect path, and switches to cross-subdomain cookies once the
// real quickengine.net domain is live (see docs/STATE.md domain checklist).
const trustedOrigins = [
	serverEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
	serverEnv.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	serverEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	serverEnv.NEXT_PUBLIC_APP_URL,
	serverEnv.NEXT_PUBLIC_DASHBOARD_URL,
].filter(
	(origin, index, all) => Boolean(origin) && all.indexOf(origin) === index,
);

export const auth = betterAuth({
	baseURL: serverEnv.BETTER_AUTH_URL,
	secret: serverEnv.BETTER_AUTH_SECRET,
	trustedOrigins,
	// In prod, share the session cookie across subdomains (web/auth/dashboard) by
	// setting AUTH_COOKIE_DOMAIN (e.g. ".quickengine.xyz"). Unset locally — every
	// localhost port already shares the cookie.
	...(serverEnv.AUTH_COOKIE_DOMAIN
		? {
				advanced: {
					crossSubDomainCookies: {
						enabled: true,
						domain: serverEnv.AUTH_COOKIE_DOMAIN,
					},
				},
			}
		: {}),
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: quickengineUsers,
			session: quickengineSessions,
			account: quickengineAccounts,
			verification: quickengineVerifications,
			passkey: quickenginePasskeys,
			twoFactor: quickengineTwoFactors,
		},
	}),
	emailAndPassword: {
		enabled: true,
		// Password is an optional method (passkeys/OTP come next); when used, an
		// account must verify its email before it can sign in.
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await getEmailProvider().send({
				to: user.email,
				subject: "Reset your QuickEngine password",
				text: `Reset your QuickEngine password:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
			});
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await getEmailProvider().send({
				to: user.email,
				subject: "Verify your QuickEngine email",
				text: `Welcome to QuickEngine. Verify your email to activate your account:\n\n${url}`,
			});
		},
	},
	socialProviders: {
		...(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: serverEnv.GOOGLE_CLIENT_ID,
						clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
					},
				}
			: {}),
		...(serverEnv.GITHUB_CLIENT_ID && serverEnv.GITHUB_CLIENT_SECRET
			? {
					github: {
						clientId: serverEnv.GITHUB_CLIENT_ID,
						clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
					},
				}
			: {}),
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
	// Rate limiting protects the auth endpoints (sign-in, sign-up, reset, etc.).
	// Better Auth applies stricter per-endpoint rules on top of this baseline.
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
	},
	// Passwordless: email OTP + magic link (both send via the email provider),
	// plus WebAuthn passkeys (the auth app hosts the ceremony; rpID/origin default
	// to the BETTER_AUTH_URL host — `localhost` in dev, the auth domain in prod).
	// nextCookies() must stay LAST so it can flush Set-Cookie in server actions.
	plugins: [
		// TOTP two-factor + recovery codes. With 2FA on, password sign-in returns
		// a twoFactorRedirect instead of a session until a code is verified.
		twoFactor({ issuer: "QuickEngine" }),
		// Bearer tokens for native clients (desktop + mobile, both Tauri). Exposes
		// the session token in a `set-auth-token` response header and accepts
		// `Authorization: Bearer <token>` — no cookies, no new table. Web keeps
		// using cookies; this is purely the token path for native surfaces.
		bearer(),
		passkey({ rpName: "QuickEngine" }),
		emailOTP({
			async sendVerificationOTP({ email, otp }) {
				await getEmailProvider().send({
					to: email,
					subject: "Your QuickEngine sign-in code",
					text: `Your QuickEngine code is ${otp}. It expires shortly. If you didn't request it, ignore this email.`,
				});
			},
		}),
		magicLink({
			async sendMagicLink({ email, url }) {
				await getEmailProvider().send({
					to: email,
					subject: "Your QuickEngine sign-in link",
					text: `Sign in to QuickEngine:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
				});
			},
		}),
		nextCookies(),
	],
});

export type Session = typeof auth.$Infer.Session;

/**
 * Read the current session from request headers. Any app (web, admin, future
 * native gateways) verifies auth through this — the auth app stays the single
 * authority; other surfaces never host the Better Auth handler themselves.
 */
export const getSession = async (headers: Headers) =>
	auth.api.getSession({ headers });

/** Like getSession, but throws when there is no authenticated session. */
export const requireSession = async (headers: Headers) => {
	const session = await getSession(headers);

	if (!session) {
		throw new Error("UNAUTHENTICATED");
	}

	return session;
};
