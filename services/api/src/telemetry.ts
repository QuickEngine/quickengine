import { trace } from "@opentelemetry/api";
import * as Sentry from "@sentry/node";
import type { ApiConfig } from "./config";

export type ApiTelemetry = {
	captureException(error: unknown, context: Record<string, unknown>): void;
	withSpan<T>(
		name: string,
		attributes: Record<string, string>,
		work: () => Promise<T>,
	): Promise<T>;
};

export const noopTelemetry: ApiTelemetry = {
	captureException() {},
	withSpan: (_name, _attributes, work) => work(),
};

export function initializeTelemetry(config: ApiConfig): ApiTelemetry {
	if (config.sentryDsn) {
		Sentry.init({
			dsn: config.sentryDsn,
			enabled: config.environment === "production",
			environment: config.environment,
			release: config.release,
			tracesSampleRate: config.tracesSampleRate,
		});
	}

	const tracer = trace.getTracer("@quickengine/api", config.version);

	return {
		captureException(error, context) {
			Sentry.withScope((scope) => {
				scope.setContext("quickengine", context);
				Sentry.captureException(error);
			});
		},
		withSpan(name, attributes, work) {
			return tracer.startActiveSpan(name, { attributes }, async (span) => {
				try {
					return await work();
				} catch (error) {
					span.recordException(
						error instanceof Error ? error : new Error(String(error)),
					);
					throw error;
				} finally {
					span.end();
				}
			});
		},
	};
}
