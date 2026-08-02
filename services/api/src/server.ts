import process from "node:process";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadApiConfig } from "./config";
import { defaultPlatformDependencies } from "./default-dependencies";
import { createDefaultReadinessChecks } from "./default-readiness";
import { createJsonLogger } from "./logger";
import { registerAllRoutes } from "./register-routes";
import { initializeTelemetry } from "./telemetry";

const config = loadApiConfig();
const logger = createJsonLogger({
	level: config.logLevel,
	service: "quickengine-api",
});
const app = createApp(config, {
	logger,
	readinessChecks: createDefaultReadinessChecks(config),
	registerRoutes(app, routeLogger) {
		// 🔴 Delegated, and it must stay delegated.
		//
		// This file used to hand-maintain its own copy of the route list, and it
		// had silently fallen behind: credits, integration health, product events
		// and saved views existed in `registerAllRoutes` — therefore in production
		// and in every test — and simply did not exist under `pnpm dev`. A route
		// added correctly would 404 locally and work when deployed, which is the
		// worst direction for that bug to point.
		//
		// One list, one truth. `index.ts` does the same.
		registerAllRoutes(app, {
			dependencies: defaultPlatformDependencies,
			logger: routeLogger,
		});
	},
	telemetry: initializeTelemetry(config),
});
const server = serve({ fetch: app.fetch, port: config.port });

server.once("listening", () => {
	logger.info("server.started", { baseUrl: config.baseUrl, port: config.port });
});
server.on("error", (error) => {
	logger.error("server.failed", { error, port: config.port });
	process.exitCode = 1;
});

let stopping = false;
function shutdown(signal: string) {
	if (stopping) return;
	stopping = true;
	logger.info("server.stopping", { signal });
	const forced = setTimeout(() => {
		logger.error("server.stop_timed_out", { signal });
		if (
			"closeAllConnections" in server &&
			typeof server.closeAllConnections === "function"
		) {
			server.closeAllConnections();
		}
		process.exitCode = 1;
	}, config.requestTimeoutMs + 1000);
	forced.unref();
	server.close((error) => {
		clearTimeout(forced);
		if (error) {
			logger.error("server.stop_failed", { error });
			process.exitCode = 1;
		} else {
			logger.info("server.stopped", { signal });
		}
	});
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
