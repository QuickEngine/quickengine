import { createApp } from "./app";
import { loadApiConfig } from "./config";
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
	telemetry: initializeTelemetry(config),
});

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
