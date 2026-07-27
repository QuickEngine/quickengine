import {
	webhookEndpointInputSchema,
	webhookEndpointPatchSchema,
} from "@quickengine/event-dispatch";
import { bookingInputSchema } from "@quickengine/mod-bookings";
import {
	clientAddressInputSchema,
	clientAddressPatchSchema,
	clientRecordInputSchema,
	clientRecordPatchSchema,
} from "@quickengine/mod-client-records";
import { contractInputSchema } from "@quickengine/mod-contracts-esign";
import { documentInputSchema, folderInputSchema } from "@quickengine/mod-files";
import { createFulfillmentInputSchema } from "@quickengine/mod-fulfillment";
import {
	inventoryAdjustmentInputSchema,
	inventoryItemInputSchema,
} from "@quickengine/mod-inventory";
import { createInvoiceInputSchema } from "@quickengine/mod-invoicing";
import { orderInputSchema } from "@quickengine/mod-orders";
import {
	recordPaymentInputSchema,
	refundPaymentInputSchema,
} from "@quickengine/mod-payments";
import {
	catalogItemInputSchema,
	catalogItemPatchSchema,
	productVariantInputSchema,
	productVariantPatchSchema,
} from "@quickengine/mod-products-services";
import {
	milestoneDetailsInputSchema,
	milestoneInputSchema,
	projectDetailsInputSchema,
	projectInputSchema,
	taskDetailsInputSchema,
	taskInputSchema,
} from "@quickengine/mod-projects-tasks";
import {
	quoteAcceptanceInputSchema,
	quoteEstimateInputSchema,
} from "@quickengine/mod-quotes-estimates";
import { trafficEventInputSchema } from "@quickengine/mod-reporting-analytics";
import {
	shipmentInputSchema,
	shipmentTrackingPatchSchema,
} from "@quickengine/mod-shipping";
import {
	manualTimeEntryInputSchema,
	timeEntryDetailsInputSchema,
	timerStartInputSchema,
} from "@quickengine/mod-time-tracking";
import type { z } from "zod";
import { inviteMemberSchema } from "./account-team-routes";
import {
	archiveWorkspaceSchema,
	createWorkspaceSchema,
	renameWorkspaceSchema,
	workspaceModuleSchema,
} from "./account-workspace-routes";
import { roleInputSchema, rolePatchSchema } from "./roles-routes";

/**
 * Request bodies, keyed by `operationId`.
 *
 * These are the **same Zod schemas the routes validate with**, not a parallel
 * description of them. That is the whole point: a hand-written OpenAPI body drifts
 * from the validator the first time someone adds a field, and the document then
 * lies with confidence. Converting the real schema means the document cannot be
 * wrong without the validation also being wrong.
 *
 * An operation absent from this map is either bodyless (a status transition
 * carrying its value in the path, an archive/restore) or documented inline.
 * `openapi.test.ts` holds the coverage line so the gap can only shrink.
 */
export const REQUEST_SCHEMAS: Record<string, z.ZodType> = {
	// Client records
	createClient: clientRecordInputSchema,
	updateClient: clientRecordPatchSchema,
	createClientAddress: clientAddressInputSchema,
	updateClientAddress: clientAddressPatchSchema,

	// Catalog
	createCatalogItem: catalogItemInputSchema,
	updateCatalogItem: catalogItemPatchSchema,
	createProductVariant: productVariantInputSchema,
	updateProductVariant: productVariantPatchSchema,

	// Quotes
	createQuote: quoteEstimateInputSchema,
	updateDraftQuote: quoteEstimateInputSchema,
	acceptQuote: quoteAcceptanceInputSchema,

	// Money
	createInvoice: createInvoiceInputSchema,
	// The update takes the create shape minus the number prefix, which is assigned
	// once and never re-supplied.
	updateDraftInvoice: createInvoiceInputSchema.omit({ numberPrefix: true }),
	recordPayment: recordPaymentInputSchema,
	refundPayment: refundPaymentInputSchema,

	// Commerce
	createOrder: orderInputSchema,
	updateDraftOrder: orderInputSchema,
	createFulfillment: createFulfillmentInputSchema,
	createInventoryItem: inventoryItemInputSchema,
	updateInventoryItem: inventoryItemInputSchema,
	applyInventoryAdjustment: inventoryAdjustmentInputSchema,
	createShipment: shipmentInputSchema,
	updateDraftShipment: shipmentInputSchema,
	updateShipmentTracking: shipmentTrackingPatchSchema,

	// Service operations
	createProject: projectInputSchema,
	updateProject: projectDetailsInputSchema,
	createMilestone: milestoneInputSchema,
	updateMilestone: milestoneDetailsInputSchema,
	createTask: taskInputSchema,
	updateTask: taskDetailsInputSchema,
	createBooking: bookingInputSchema,
	updateBooking: bookingInputSchema,
	createManualTimeEntry: manualTimeEntryInputSchema,
	updateManualTimeEntry: timeEntryDetailsInputSchema,
	startTimer: timerStartInputSchema,

	// Documents
	createContract: contractInputSchema,
	updateDraftContract: contractInputSchema,
	createFileFolder: folderInputSchema,
	updateFileFolder: folderInputSchema,
	updateFileDocument: documentInputSchema,

	// Platform
	recordTrafficEvent: trafficEventInputSchema,
	createWebhookEndpoint: webhookEndpointInputSchema,
	updateWebhookEndpoint: webhookEndpointPatchSchema,
	inviteMember: inviteMemberSchema,
	createWorkspace: createWorkspaceSchema,
	renameWorkspace: renameWorkspaceSchema,
	setWorkspaceArchived: archiveWorkspaceSchema,
	setWorkspaceModuleEnabled: workspaceModuleSchema,
	createRole: roleInputSchema,
	updateRole: rolePatchSchema,
};
