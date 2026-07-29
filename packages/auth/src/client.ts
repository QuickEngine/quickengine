import { passkeyClient } from "@better-auth/passkey/client";
import {
	createDevelopmentViteClientEnv,
	createProductionViteClientEnv,
} from "@quickengine/env/vite";
import {
	emailOTPClient,
	magicLinkClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

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
