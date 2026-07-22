import process from "node:process";
import { z } from "zod";

const DEFAULT_CORS_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
	"http://localhost:3011",
	"https://quickengine.xyz",
	"https://auth.quickengine.xyz",
	"https://account.quickengine.xyz",
	"https://dash.quickengine.xyz",
];

const apiEnvSchema = z.object({
	API_BASE_URL: z.url().default("http://localhost:3020"),
	API_CORS_ORIGINS: z.string().optional(),
	API_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
	API_PORT: z.coerce.number().int().min(1).max(65_535).default(3020),
	API_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
	API_VERSION: z.string().trim().min(1).default("0.1.0"),
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	SENTRY_DSN: z.url().optional(),
	VERCEL_GIT_COMMIT_SHA: z.string().trim().min(1).optional(),
});

export type ApiConfig = {
	baseUrl: string;
	corsOrigins: ReadonlySet<string>;
	environment: "development" | "test" | "production";
	logLevel: "debug" | "info" | "warn" | "error";
	port: number;
	release?: string;
	sentryDsn?: string;
	tracesSampleRate: number;
	version: string;
};

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
	const parsed = apiEnvSchema.parse(env);
	const configuredOrigins = parsed.API_CORS_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	return {
		baseUrl: parsed.API_BASE_URL,
		corsOrigins: new Set(
			configuredOrigins?.length ? configuredOrigins : DEFAULT_CORS_ORIGINS,
		),
		environment: parsed.NODE_ENV,
		logLevel: parsed.API_LOG_LEVEL,
		port: parsed.API_PORT,
		release: parsed.VERCEL_GIT_COMMIT_SHA,
		sentryDsn: parsed.SENTRY_DSN,
		tracesSampleRate: parsed.API_TRACES_SAMPLE_RATE,
		version: parsed.API_VERSION,
	};
}
