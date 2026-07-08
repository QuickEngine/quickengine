import { passkeyClient } from "@better-auth/passkey/client";
import { clientEnv } from "@quickengine/env/client";
import {
	emailOTPClient,
	magicLinkClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
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
