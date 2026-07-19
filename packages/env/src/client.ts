/// <reference path="./env.d.ts" />

import { z } from "zod";

const url = z.string().url();

export const clientEnvSchema = z.object({
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL: url.default("http://localhost:3002"),
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: url.default("http://localhost:3000"),
	NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL: url.default("http://localhost:3001"),
	NEXT_PUBLIC_QUICKDASH_WEB_URL: url.default("http://localhost:3010"),
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: url.default("http://localhost:3011"),
	// Pusher's publishable key + cluster, safe to expose to the browser. Optional so
	// local dev (no realtime) parses fine; the realtime hook no-ops when they're unset.
	NEXT_PUBLIC_PUSHER_KEY: z.string().optional(),
	NEXT_PUBLIC_PUSHER_CLUSTER: z.string().optional(),
});

export const clientEnv = clientEnvSchema.parse({
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL,
	NEXT_PUBLIC_QUICKDASH_WEB_URL: process.env.NEXT_PUBLIC_QUICKDASH_WEB_URL,
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL,
	NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
	NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
