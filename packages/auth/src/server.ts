import { db } from "@quickengine/db";
import {
	quickengineAccounts,
	quickengineSessions,
	quickengineUsers,
	quickengineVerifications,
} from "@quickengine/db/schema/quickengine";
import { serverEnv } from "@quickengine/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
	baseURL: serverEnv.BETTER_AUTH_URL,
	secret: serverEnv.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: quickengineUsers,
			session: quickengineSessions,
			account: quickengineAccounts,
			verification: quickengineVerifications,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
});

export type Session = typeof auth.$Infer.Session;
