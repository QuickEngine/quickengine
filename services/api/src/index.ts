import { createApp } from "./app";
import { loadApiConfig } from "./config";
import { createJsonLogger } from "./logger";
import { initializeTelemetry } from "./telemetry";

const config = loadApiConfig();
const app = createApp(config, {
	logger: createJsonLogger({
		level: config.logLevel,
		service: "quickengine-api",
	}),
	telemetry: initializeTelemetry(config),
});

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
