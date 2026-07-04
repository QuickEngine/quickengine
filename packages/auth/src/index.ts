export type QuickEngineAuthConfig = {
	appName: string;
	baseUrl: string;
};

export const createAuthConfig = (
	config: QuickEngineAuthConfig,
): QuickEngineAuthConfig => config;

export type { Session } from "./server";
