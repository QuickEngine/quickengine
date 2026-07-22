import process from "node:process";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadApiConfig } from "./config";
import { createJsonLogger } from "./logger";
import { initializeTelemetry } from "./telemetry";

const config = loadApiConfig();
const logger = createJsonLogger({
	level: config.logLevel,
	service: "quickengine-api",
});
const app = createApp(config, {
	logger,
	telemetry: initializeTelemetry(config),
});
const server = serve({ fetch: app.fetch, port: config.port });

logger.info("server.started", { baseUrl: config.baseUrl, port: config.port });

function shutdown(signal: string) {
	logger.info("server.stopping", { signal });
	server.close((error) => {
		if (error) {
			logger.error("server.stop_failed", { error });
			process.exitCode = 1;
		}
	});
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
