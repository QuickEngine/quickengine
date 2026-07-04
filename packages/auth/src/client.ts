import { clientEnv } from "@quickengine/env/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
