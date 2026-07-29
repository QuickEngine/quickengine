import {
	createDevelopmentViteClientEnv,
	createProductionViteClientEnv,
} from "@quickengine/env/vite";

export const env = import.meta.env.PROD
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
