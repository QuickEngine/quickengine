import {
	createDevelopmentViteClientEnv,
	createProductionViteClientEnv,
} from "@quickengine/env/vite";

/**
 * Browser configuration.
 *
 * Vite only exposes `VITE_`-prefixed variables to client code, which is a
 * feature: a server secret cannot be leaked into the bundle by accident. The
 * fallbacks are development defaults, never production values.
 */
const env = import.meta.env.PROD
	? createProductionViteClientEnv(import.meta.env)
	: createDevelopmentViteClientEnv({
			...import.meta.env,
			VITE_WEB_URL: import.meta.env.VITE_WEB_URL ?? "http://localhost:3000",
			VITE_ACCOUNT_URL:
				import.meta.env.VITE_ACCOUNT_URL ?? "http://localhost:3001",
			VITE_AUTH_URL: import.meta.env.VITE_AUTH_URL ?? "http://localhost:3002",
			VITE_DASH_URL: import.meta.env.VITE_DASH_URL ?? "http://localhost:3011",
			VITE_API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:3020",
		});

export const clientEnv = {
	AUTH_URL: env.VITE_AUTH_URL,
	WEB_URL: env.VITE_WEB_URL,
	DASH_URL: env.VITE_DASH_URL,
	STRIPE_PUBLISHABLE_KEY: env.VITE_STRIPE_PUBLISHABLE_KEY,
	SENTRY_DSN: env.VITE_SENTRY_DSN,
} as const;
