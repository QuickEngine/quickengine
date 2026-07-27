import { getCacheProvider } from "@quickengine/cache";
import { mutationUnitOfWork } from "@quickengine/db";
import { registerAccountTeamRoutes } from "./account-team-routes";
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
			platform: {
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
		registerAccountTeamRoutes(app, { platform: dependencies.platform });
		registerInngestRoutes(app);
		registerStripeWebhookRoutes(app, { logger });
	},
	telemetry: initializeTelemetry(config),
});

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
// The Vercel adapter (`api/index.ts`) loads this from `dist`, so it must be exported here.
export { readNodeRequestBody } from "./node-body";
