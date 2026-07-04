/// <reference path="./env.d.ts" />

import { z } from "zod";

const url = z.string().url();

export const clientEnvSchema = z.object({
	NEXT_PUBLIC_APP_URL: url.default("http://localhost:3000"),
	NEXT_PUBLIC_ADMIN_URL: url.default("http://localhost:3001"),
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL: url.default("http://localhost:3000"),
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: url.default("http://localhost:3000"),
	NEXT_PUBLIC_QUICKENGINE_ADMIN_URL: url.default("http://localhost:3001"),
	NEXT_PUBLIC_QUICKDASH_WEB_URL: url.default("http://localhost:3010"),
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: url.default("http://localhost:3011"),
	NEXT_PUBLIC_QUICKFLOW_WEB_URL: url.default("http://localhost:3020"),
	NEXT_PUBLIC_QUICKFLOW_ADMIN_URL: url.default("http://localhost:3021"),
});

export const clientEnv = clientEnvSchema.parse({
	NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
	NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	NEXT_PUBLIC_QUICKENGINE_ADMIN_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_ADMIN_URL,
	NEXT_PUBLIC_QUICKDASH_WEB_URL: process.env.NEXT_PUBLIC_QUICKDASH_WEB_URL,
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL,
	NEXT_PUBLIC_QUICKFLOW_WEB_URL: process.env.NEXT_PUBLIC_QUICKFLOW_WEB_URL,
	NEXT_PUBLIC_QUICKFLOW_ADMIN_URL: process.env.NEXT_PUBLIC_QUICKFLOW_ADMIN_URL,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
