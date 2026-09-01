import { passkeyClient } from "@better-auth/passkey/client";
import {
	createDevelopmentViteClientEnv,
	createProductionViteClientEnv,
} from "@quickengine/env/vite";
import {
	emailOTPClient,
	inferAdditionalFields,
	magicLinkClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./server";

const viteEnvironment = (
	import.meta as ImportMeta & {
		env?: Record<string, unknown> & { PROD?: boolean };
	}
).env;

const env = viteEnvironment?.PROD
	? createProductionViteClientEnv(viteEnvironment)
	: createDevelopmentViteClientEnv({
			...viteEnvironment,
			VITE_WEB_URL: viteEnvironment?.VITE_WEB_URL ?? "http://localhost:3000",
			VITE_ACCOUNT_URL:
				viteEnvironment?.VITE_ACCOUNT_URL ?? "http://localhost:3001",
			VITE_AUTH_URL: viteEnvironment?.VITE_AUTH_URL ?? "http://localhost:3002",
			VITE_DASH_URL: viteEnvironment?.VITE_DASH_URL ?? "http://localhost:3011",
			VITE_API_URL: viteEnvironment?.VITE_API_URL ?? "http://localhost:3020",
		});

export const authClient = createAuthClient({
	baseURL: env.VITE_AUTH_URL,
	plugins: [
		/**
		 * 🔴 Without this, NOTHING declared in the server's `user.additionalFields`
		 * exists on the client's session type — `companyName`,
		 * `onboardingCompletedAt` and `bannerImage` were all invisible, so any
		 * screen reading one had to cast and would never be told when the field
		 * moved or went away.
		 *
		 * ⚠️ `import type`, so the server module is erased at build time. It pulls
		 * the shape across without pulling the server — nothing here reaches the
		 * browser bundle, and hard rule 12 is untouched.
		 */
		inferAdditionalFields<typeof auth>(),
		emailOTPClient(),
		magicLinkClient(),
		passkeyClient(),
		twoFactorClient(),
	],
});

export const {
	signIn,
	signUp,
	signOut,
	useSession,
	requestPasswordReset,
	resetPassword,
	sendVerificationEmail,
	verifyEmail,
	emailOtp,
	passkey,
	twoFactor,
} = authClient;
