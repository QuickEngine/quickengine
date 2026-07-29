import { z } from "zod";

const URL_KEYS = [
	"VITE_WEB_URL",
	"VITE_ACCOUNT_URL",
	"VITE_AUTH_URL",
	"VITE_DASH_URL",
	"VITE_API_URL",
] as const;

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

type ViteEnvironmentSource = Record<string, unknown>;

function valuesFromSource(source: ViteEnvironmentSource) {
	return {
		VITE_WEB_URL: emptyStringAsUndefined(source.VITE_WEB_URL),
		VITE_ACCOUNT_URL: emptyStringAsUndefined(source.VITE_ACCOUNT_URL),
		VITE_AUTH_URL: emptyStringAsUndefined(source.VITE_AUTH_URL),
		VITE_DASH_URL: emptyStringAsUndefined(source.VITE_DASH_URL),
		VITE_API_URL: emptyStringAsUndefined(source.VITE_API_URL),
		VITE_PUSHER_KEY: source.VITE_PUSHER_KEY,
		VITE_PUSHER_CLUSTER: source.VITE_PUSHER_CLUSTER,
		VITE_STRIPE_PUBLISHABLE_KEY: source.VITE_STRIPE_PUBLISHABLE_KEY,
		VITE_SENTRY_DSN: source.VITE_SENTRY_DSN,
	};
}

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

export function createDevelopmentViteClientEnv(
	source: ViteEnvironmentSource,
): ViteClientEnv {
	return viteClientEnvSchema.parse(valuesFromSource(source));
}

export function createProductionViteClientEnv(
	source: ViteEnvironmentSource,
): ViteClientEnv {
	const environment = viteClientEnvSchema.parse(valuesFromSource(source));
	rejectUnsafeProductionOrigins(environment);
	return environment;
}
