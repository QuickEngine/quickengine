import { createApp } from "./app";
import { loadApiConfig } from "./config";
import { defaultPlatformDependencies } from "./default-dependencies";
import { createDefaultReadinessChecks } from "./default-readiness";
import { createJsonLogger } from "./logger";
import { registerAllRoutes } from "./register-routes";
import { initializeTelemetry } from "./telemetry";

const config = loadApiConfig();
const app = createApp(config, {
	logger: createJsonLogger({
		level: config.logLevel,
		service: "quickengine-api",
	}),
	readinessChecks: createDefaultReadinessChecks(config),
	registerRoutes(app, logger) {
		// Delegated so `tenant-isolation.test.ts` can build the identical route
		// table. A sweep over routes the test registers itself would prove nothing
		// about the app that actually ships.
		registerAllRoutes(app, {
			logger,
			dependencies: {
				...defaultPlatformDependencies,
				// Only real deployments meter and gate; local development and tests do
				// neither. Imported lazily — pulling billing into this module's type
				// graph conflicts with the Node globals `config.ts` relies on.
				...(config.environment === "production"
					? {
							enforceUsage: async (input: {
								scopeId: string;
								meter: "apiRequests";
								amount: number;
							}) => {
								const { enforce } = await import("@quickengine/billing");
								return enforce(input);
							},
						}
					: {}),
			},
		});
	},
	telemetry: initializeTelemetry(config),
});

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
// The Vercel adapter (`api/index.ts`) loads this from `dist`, so it must be exported here.
export { readNodeRequestBody } from "./node-body";
