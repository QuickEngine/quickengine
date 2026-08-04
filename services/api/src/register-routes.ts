import { getCacheProvider } from "@quickengine/cache";
import { mutationUnitOfWork } from "@quickengine/db";
import type { Hono } from "hono";
import { registerAccountReadRoutes } from "./account-read-routes";
import { registerAccountRoutes } from "./account-routes";
import { registerAccountTeamRoutes } from "./account-team-routes";
import { registerAccountWorkspaceRoutes } from "./account-workspace-routes";
import { registerAuthRoutes } from "./auth-routes";
import { registerBillingInfoRoutes } from "./billing-info-routes";
import { registerBookingsRoutes } from "./bookings-routes";
import { registerCategoryRoutes } from "./category-routes";
import { registerCheckoutRoutes } from "./checkout-routes";
import { registerClientRecordRoutes } from "./client-records-routes";
import { registerConnectWebhookRoutes } from "./connect-webhook-routes";
import { registerContentRoutes } from "./content-routes";
import { registerContractsRoutes } from "./contracts-routes";
import { registerCreditRoutes } from "./credit-routes";
import { customerAuthDependencies } from "./customer-auth-dependencies";
import { registerCustomerRoutes } from "./customer-routes";
import { registerDiscountRoutes } from "./discount-routes";
import { registerFilesRoutes } from "./files-routes";
import { registerFulfillmentRoutes } from "./fulfillment-routes";
import { registerInngestRoutes } from "./inngest-routes";
import { registerIntegrationHealthRoutes } from "./integration-health-routes";
import { registerInventoryRoutes } from "./inventory-routes";
import { registerInvoicesRoutes } from "./invoices-routes";
import type { ApiLogger } from "./logger";
import { registerOrdersRoutes } from "./orders-routes";
import { registerPaymentsRoutes } from "./payments-routes";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { registerPortalDomainRoutes } from "./portal-domain-routes";
import { registerProductEventRoutes } from "./product-event-routes";
import { registerProductsServicesRoutes } from "./products-services-routes";
import { registerProjectsRoutes } from "./projects-routes";
import { registerQuickDashRoutes } from "./quickdash-routes";
import { registerQuotesRoutes } from "./quotes-routes";
import { registerRealtimeRoutes } from "./realtime-routes";
import { registerReportingRoutes } from "./reporting-routes";
import { registerResendWebhookRoutes } from "./resend-webhook-routes";
import { registerReviewRoutes } from "./review-routes";
import { registerRolesRoutes } from "./roles-routes";
import { registerSavedViewRoutes } from "./saved-view-routes";
import { registerShippingRoutes } from "./shipping-routes";
import { registerStripeWebhookRoutes } from "./stripe-webhook-routes";
import { registerTimeTrackingRoutes } from "./time-tracking-routes";
import { registerWebhookRoutes } from "./webhook-routes";

/**
 * Register every route on an app instance.
 *
 * 🔑 Extracted from `index.ts` so a TEST can build the real route table. A sweep
 * over a hand-written list of endpoints is exactly as stale as the list, and the
 * whole point of `tenant-isolation.test.ts` is to cover routes nobody remembered
 * to think about — including ones added after it was written.
 */
export function registerAllRoutes(
	app: Hono<PlatformEnv>,
	options: { dependencies: PlatformDependencies; logger: ApiLogger },
) {
	const dependencies = {
		cache: getCacheProvider(),
		logger: options.logger,
		// Carries the logger so `enforceUsage` can report a metering failure. See
		// the note on `PlatformDependencies.logger`.
		platform: { ...options.dependencies, logger: options.logger },
		uow: mutationUnitOfWork,
	};
	const logger = options.logger;
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
	registerIntegrationHealthRoutes(app, dependencies);
	registerReviewRoutes(app, dependencies);
	registerSavedViewRoutes(app, dependencies);
	registerPortalDomainRoutes(app, dependencies);
	registerProductEventRoutes(app, dependencies);
	// The customer surface. Registered last among the /v1 families so its
	// namespace is unmistakably separate from the operator routes above.
	registerCategoryRoutes(app, dependencies);
	registerCheckoutRoutes(app, dependencies);
	registerContentRoutes(app, dependencies);
	registerDiscountRoutes(app, dependencies);
	registerCustomerRoutes(app, {
		...dependencies,
		auth: customerAuthDependencies,
	});
	registerRealtimeRoutes(app, dependencies);
	registerRolesRoutes(app, dependencies);
	registerResendWebhookRoutes(app, { logger });
	registerBillingInfoRoutes(app);
	registerCreditRoutes(app, { platform: dependencies.platform });
	registerAuthRoutes(app);
	registerAccountWorkspaceRoutes(app, { platform: dependencies.platform });
	registerAccountTeamRoutes(app, { platform: dependencies.platform });
	registerAccountRoutes(app, { platform: dependencies.platform });
	registerAccountReadRoutes(app, { platform: dependencies.platform });
	registerQuickDashRoutes(app, { platform: dependencies.platform });
	registerInngestRoutes(app);
	registerConnectWebhookRoutes(app, { logger });
	registerStripeWebhookRoutes(app, { logger });
}
