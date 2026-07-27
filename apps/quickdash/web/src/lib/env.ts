export const clientEnv = {
	ACCOUNT_URL: import.meta.env.VITE_ACCOUNT_URL ?? "http://localhost:3001",
	AUTH_URL: import.meta.env.VITE_AUTH_URL ?? "http://localhost:3002",
} as const;
