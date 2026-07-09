/// <reference path="./env.d.ts" />

import { z } from "zod";

const url = z.string().url();

export const clientEnvSchema = z.object({
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL: url.default("http://localhost:3002"),
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: url.default("http://localhost:3000"),
	NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL: url.default("http://localhost:3001"),
	NEXT_PUBLIC_QUICKDASH_WEB_URL: url.default("http://localhost:3010"),
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: url.default("http://localhost:3011"),
});

export const clientEnv = clientEnvSchema.parse({
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	NEXT_PUBLIC_QUICKDASH_WEB_URL: process.env.NEXT_PUBLIC_QUICKDASH_WEB_URL,
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
