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
	API_PORT: z.coerce.number().int().min(1).max(65_535).default(3020),
	API_VERSION: z.string().trim().min(1).default("0.1.0"),
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
});

export type ApiConfig = {
	baseUrl: string;
	corsOrigins: ReadonlySet<string>;
	environment: "development" | "test" | "production";
	port: number;
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
		port: parsed.API_PORT,
		version: parsed.API_VERSION,
	};
}
