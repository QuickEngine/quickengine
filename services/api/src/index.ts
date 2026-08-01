import { getCacheProvider } from "@quickengine/cache";
import { mutationUnitOfWork } from "@quickengine/db";
import { registerAccountReadRoutes } from "./account-read-routes";
import { registerAccountRoutes } from "./account-routes";
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
import { registerIntegrationHealthRoutes } from "./integration-health-routes";
import { registerInventoryRoutes } from "./inventory-routes";
import { registerInvoicesRoutes } from "./invoices-routes";
import { createJsonLogger } from "./logger";
import { registerOrdersRoutes } from "./orders-routes";
import { registerPaymentsRoutes } from "./payments-routes";
import { registerProductEventRoutes } from "./product-event-routes";
import { registerProductsServicesRoutes } from "./products-services-routes";
import { registerProjectsRoutes } from "./projects-routes";
import { registerQuickDashRoutes } from "./quickdash-routes";
import { registerQuotesRoutes } from "./quotes-routes";
import { registerRealtimeRoutes } from "./realtime-routes";
import { registerAllRoutes } from "./register-routes";
import { registerReportingRoutes } from "./reporting-routes";
import { registerResendWebhookRoutes } from "./resend-webhook-routes";
import { registerRolesRoutes } from "./roles-routes";
import { registerSavedViewRoutes } from "./saved-view-routes";
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
