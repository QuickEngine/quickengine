import { z } from "zod";

const LOCAL_URLS = {
	VITE_WEB_URL: "http://localhost:3000",
	VITE_ACCOUNT_URL: "http://localhost:3001",
	VITE_AUTH_URL: "http://localhost:3002",
	VITE_DASH_URL: "http://localhost:3011",
	VITE_API_URL: "http://localhost:3020",
} as const;

const URL_KEYS = Object.keys(LOCAL_URLS) as Array<keyof typeof LOCAL_URLS>;

const emptyStringAsUndefined = (value: unknown) =>
	value === "" ? undefined : value;

const origin = z
	.string()
	.url()
	.refine((value) => {
		const url = new URL(value);
		return (
			url.username === "" &&
			url.password === "" &&
			url.pathname === "/" &&
			url.search === "" &&
			url.hash === ""
		);
	}, "Must be an origin without credentials, a path, query parameters, or a hash.")
	.transform((value) => new URL(value).origin);

const optionalString = z.preprocess(
	emptyStringAsUndefined,
	z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
	emptyStringAsUndefined,
	z.string().url().optional(),
);

export const viteClientEnvSchema = z.object({
	VITE_WEB_URL: origin,
	VITE_ACCOUNT_URL: origin,
	VITE_AUTH_URL: origin,
	VITE_DASH_URL: origin,
	VITE_API_URL: origin,
	VITE_PUSHER_KEY: optionalString,
	VITE_PUSHER_CLUSTER: optionalString,
	VITE_STRIPE_PUBLISHABLE_KEY: optionalString,
	VITE_SENTRY_DSN: optionalUrl,
});

export type ViteClientEnv = z.infer<typeof viteClientEnvSchema>;
export type ViteClientEnvMode = "development" | "production";

type ViteEnvironmentSource = Record<string, unknown>;

function rejectUnsafeProductionOrigins(environment: ViteClientEnv) {
	const failures = URL_KEYS.flatMap((key) => {
		const url = new URL(environment[key]);
		const localHost =
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "0.0.0.0" ||
			url.hostname === "::1" ||
			url.hostname === "[::1]" ||
			url.hostname.endsWith(".localhost");
		if (url.protocol !== "https:")
			return [`${key} must use HTTPS in production.`];
		if (localHost) return [`${key} cannot target localhost in production.`];
		return [];
	});
	if (failures.length > 0) {
		throw new Error(
			`Invalid production Vite environment:\n${failures.join("\n")}`,
		);
	}
}

/**
 * Parse browser-visible configuration supplied by a Vite application.
 *
 * Callers must state their mode explicitly. Development receives the documented
 * local ports; production receives no URL defaults and fails immediately when a
 * deployment is incomplete or points back at a developer machine.
 */
export function createViteClientEnv(
	source: ViteEnvironmentSource,
	options: { mode: ViteClientEnvMode },
): ViteClientEnv {
	const values = {
		VITE_WEB_URL:
			emptyStringAsUndefined(source.VITE_WEB_URL) ??
			(options.mode === "development" ? LOCAL_URLS.VITE_WEB_URL : undefined),
		VITE_ACCOUNT_URL:
			emptyStringAsUndefined(source.VITE_ACCOUNT_URL) ??
			(options.mode === "development"
				? LOCAL_URLS.VITE_ACCOUNT_URL
				: undefined),
		VITE_AUTH_URL:
			emptyStringAsUndefined(source.VITE_AUTH_URL) ??
			(options.mode === "development" ? LOCAL_URLS.VITE_AUTH_URL : undefined),
		VITE_DASH_URL:
			emptyStringAsUndefined(source.VITE_DASH_URL) ??
			(options.mode === "development" ? LOCAL_URLS.VITE_DASH_URL : undefined),
		VITE_API_URL:
			emptyStringAsUndefined(source.VITE_API_URL) ??
			(options.mode === "development" ? LOCAL_URLS.VITE_API_URL : undefined),
		VITE_PUSHER_KEY: source.VITE_PUSHER_KEY,
		VITE_PUSHER_CLUSTER: source.VITE_PUSHER_CLUSTER,
		VITE_STRIPE_PUBLISHABLE_KEY: source.VITE_STRIPE_PUBLISHABLE_KEY,
		VITE_SENTRY_DSN: source.VITE_SENTRY_DSN,
	};
	const environment = viteClientEnvSchema.parse(values);
	if (options.mode === "production") rejectUnsafeProductionOrigins(environment);
	return environment;
}
