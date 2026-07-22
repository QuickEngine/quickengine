import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadApiConfig } from "./config";

const config = loadApiConfig();
const app = createApp(config);
const server = serve({ fetch: app.fetch, port: config.port });

console.log(`QuickEngine API listening on ${config.baseUrl}`);

function shutdown(signal: string) {
	console.log(`QuickEngine API received ${signal}; shutting down.`);
	server.close((error) => {
		if (error) {
			console.error("QuickEngine API failed to shut down cleanly.", error);
			process.exitCode = 1;
		}
	});
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
