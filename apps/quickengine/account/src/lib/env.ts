/**
 * Browser configuration.
 *
 * Vite only exposes `VITE_`-prefixed variables to client code, which is a
 * feature: a server secret cannot be leaked into the bundle by accident. The
 * fallbacks are development defaults, never production values.
 */
export const clientEnv = {
	AUTH_URL: import.meta.env.VITE_AUTH_URL ?? "http://localhost:3002",
	WEB_URL: import.meta.env.VITE_WEB_URL ?? "http://localhost:3000",
	DASH_URL: import.meta.env.VITE_DASH_URL ?? "http://localhost:3011",
} as const;
