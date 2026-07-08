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
});

export type Session = typeof auth.$Infer.Session;
