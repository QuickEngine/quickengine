import process from "node:process";
import { serve } from "@hono/node-server";
import { getCacheProvider } from "@quickengine/cache";
import { mutationUnitOfWork } from "@quickengine/db";
import { registerAccountWorkspaceRoutes } from "./account-workspace-routes";
import { createApp } from "./app";
import { registerAuthRoutes } from "./auth-routes";
import { registerBillingInfoRoutes } from "./billing-info-routes";
import { registerBookingsRoutes } from "./bookings-routes";
import { registerClientRecordRoutes } from "./client-records-routes";
import { loadApiConfig } from "./config";
import { registerContractsRoutes } from "./contracts-routes";
import { defaultPlatformDependencies } from "./default-dependencies";
import { createDefaultReadinessChecks } from "./default-readiness";
import { registerFilesRoutes } from "./files-routes";
import { registerFulfillmentRoutes } from "./fulfillment-routes";
import { registerInngestRoutes } from "./inngest-routes";
import { registerInventoryRoutes } from "./inventory-routes";
import { registerInvoicesRoutes } from "./invoices-routes";
import { createJsonLogger } from "./logger";
import { registerOrdersRoutes } from "./orders-routes";
import { registerPaymentsRoutes } from "./payments-routes";
import { registerProductsServicesRoutes } from "./products-services-routes";
import { registerProjectsRoutes } from "./projects-routes";
import { registerQuotesRoutes } from "./quotes-routes";
import { registerRealtimeRoutes } from "./realtime-routes";
import { registerReportingRoutes } from "./reporting-routes";
import { registerResendWebhookRoutes } from "./resend-webhook-routes";
import { registerRolesRoutes } from "./roles-routes";
import { registerShippingRoutes } from "./shipping-routes";
import { registerStripeWebhookRoutes } from "./stripe-webhook-routes";
import { initializeTelemetry } from "./telemetry";
import { registerTimeTrackingRoutes } from "./time-tracking-routes";
import { registerWebhookRoutes } from "./webhook-routes";

const config = loadApiConfig();
const logger = createJsonLogger({
	level: config.logLevel,
	service: "quickengine-api",
});
const app = createApp(config, {
	logger,
	readinessChecks: createDefaultReadinessChecks(config),
	registerRoutes(app, routeLogger) {
		const dependencies = {
			cache: getCacheProvider(),
			logger: routeLogger,
			platform: defaultPlatformDependencies,
			uow: mutationUnitOfWork,
		};
		registerClientRecordRoutes(app, dependencies);
		registerProductsServicesRoutes(app, dependencies);
		registerQuotesRoutes(app, dependencies);
		registerInvoicesRoutes(app, dependencies);
		registerPaymentsRoutes(app, dependencies);
		registerOrdersRoutes(app, dependencies);
		registerFulfillmentRoutes(app, dependencies);
		registerInventoryRoutes(app, dependencies);
		registerShippingRoutes(app, dependencies);
		registerProjectsRoutes(app, dependencies);
		registerBookingsRoutes(app, dependencies);
		registerTimeTrackingRoutes(app, dependencies);
		registerContractsRoutes(app, dependencies);
		registerFilesRoutes(app, dependencies);
		registerReportingRoutes(app, dependencies);
		registerWebhookRoutes(app, dependencies);
		registerRealtimeRoutes(app, dependencies);
		registerRolesRoutes(app, dependencies);
		registerResendWebhookRoutes(app, { logger });
		registerBillingInfoRoutes(app);
		registerAuthRoutes(app);
		registerAccountWorkspaceRoutes(app, { platform: dependencies.platform });
		registerInngestRoutes(app);
		registerStripeWebhookRoutes(app, { logger: routeLogger });
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
