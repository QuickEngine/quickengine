import { getCacheProvider } from "@quickengine/cache";
import { mutationUnitOfWork } from "@quickengine/db";
import { createApp } from "./app";
import { registerClientRecordRoutes } from "./client-records-routes";
import { loadApiConfig } from "./config";
import { defaultPlatformDependencies } from "./default-dependencies";
import { createDefaultReadinessChecks } from "./default-readiness";
import { registerFulfillmentRoutes } from "./fulfillment-routes";
import { registerInventoryRoutes } from "./inventory-routes";
import { registerInvoicesRoutes } from "./invoices-routes";
import { createJsonLogger } from "./logger";
import { registerOrdersRoutes } from "./orders-routes";
import { registerPaymentsRoutes } from "./payments-routes";
import { registerProductsServicesRoutes } from "./products-services-routes";
import { registerProjectsRoutes } from "./projects-routes";
import { registerQuotesRoutes } from "./quotes-routes";
import { registerShippingRoutes } from "./shipping-routes";
import { registerStripeWebhookRoutes } from "./stripe-webhook-routes";
import { initializeTelemetry } from "./telemetry";

const config = loadApiConfig();
const app = createApp(config, {
	logger: createJsonLogger({
		level: config.logLevel,
		service: "quickengine-api",
	}),
	readinessChecks: createDefaultReadinessChecks(config),
	registerRoutes(app, logger) {
		const dependencies = {
			cache: getCacheProvider(),
			logger,
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
		registerStripeWebhookRoutes(app, { logger });
	},
	telemetry: initializeTelemetry(config),
});

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
