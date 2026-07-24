import { getCacheProvider } from "@quickengine/cache";
import { mutationUnitOfWork } from "@quickengine/db";
import { createApp } from "./app";
import { registerClientRecordRoutes } from "./client-records-routes";
import { loadApiConfig } from "./config";
import { defaultPlatformDependencies } from "./default-dependencies";
import { createDefaultReadinessChecks } from "./default-readiness";
import { createJsonLogger } from "./logger";
import { initializeTelemetry } from "./telemetry";

const config = loadApiConfig();
const app = createApp(config, {
	logger: createJsonLogger({
		level: config.logLevel,
		service: "quickengine-api",
	}),
	readinessChecks: createDefaultReadinessChecks(config),
	registerRoutes(app, logger) {
		registerClientRecordRoutes(app, {
			cache: getCacheProvider(),
			logger,
			platform: defaultPlatformDependencies,
			uow: mutationUnitOfWork,
		});
	},
	telemetry: initializeTelemetry(config),
});

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
