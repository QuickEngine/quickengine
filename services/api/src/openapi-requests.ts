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
import {
	contentEntryInputSchema,
	contentManifestInputSchema,
	contentPublishInputSchema,
} from "@quickengine/mod-content";
import { contractInputSchema } from "@quickengine/mod-contracts-esign";
import { documentInputSchema, folderInputSchema } from "@quickengine/mod-files";
import { createFulfillmentInputSchema } from "@quickengine/mod-fulfillment";
import {
	catalogAvailabilityInputSchema,
	inventoryAdjustmentInputSchema,
	inventoryItemInputSchema,
} from "@quickengine/mod-inventory";
import { createInvoiceInputSchema } from "@quickengine/mod-invoicing";
import {
	checkoutInputSchema,
	discountInputSchema,
	discountPatchSchema,
	discountPreviewInputSchema,
	orderInputSchema,
} from "@quickengine/mod-orders";
import {
	paymentOnboardingInputSchema,
	paymentProviderInputSchema,
	recordPaymentInputSchema,
	refundPaymentInputSchema,
} from "@quickengine/mod-payments";
import {
	catalogItemInputSchema,
	catalogItemPatchSchema,
	categoryInputSchema,
	categoryPatchSchema,
	itemCategoriesInputSchema,
	productVariantInputSchema,
	productVariantPatchSchema,
	reviewInputSchema,
	reviewModerationSchema,
	reviewSummaryInputSchema,
	wishlistItemInputSchema,
	wishlistMergeInputSchema,
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
	shippingDestinationSchema,
	shippingRateInputSchema,
	shippingRatePatchSchema,
	shippingZoneInputSchema,
	shippingZonePatchSchema,
} from "@quickengine/mod-shipping";
import {
	manualTimeEntryInputSchema,
	timeEntryDetailsInputSchema,
	timerStartInputSchema,
} from "@quickengine/mod-time-tracking";
import { z } from "zod";
import {
	confirmSubscriptionSchema,
	createApiKeySchema,
	createOrganizationSchema,
	recommendationSchema,
	startSubscriptionSchema,
	updateApiKeyOriginsSchema,
} from "./account-routes";
import { inviteMemberSchema } from "./account-team-routes";
import {
	archiveWorkspaceSchema,
	createWorkspaceSchema,
	renameWorkspaceSchema,
	workspaceModuleSchema,
} from "./account-workspace-routes";
import {
	conversationStatusInputSchema,
	customerConversationInputSchema,
	customerMessageInputSchema,
	operatorConversationInputSchema,
} from "./customer-message-routes";
import { portalDomainInputSchema } from "./portal-domain-routes";
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

/**
 * Bodies for platform routes that parse inline rather than exporting a module
 * schema. Kept here so the document and the route cannot disagree about shape.
 */
const savedViewInputSchema = z.object({
	moduleId: z.string().min(1).max(100),
	name: z.string().min(1).max(80),
	state: z.record(z.string(), z.unknown()),
	pinned: z.boolean().optional(),
});

const savedViewPinSchema = z.object({ pinned: z.boolean() });

const productEventInputSchema = z.object({
	name: z.string().min(1),
	surface: z.enum(["web", "auth", "account", "quickdash"]),
	workspaceId: z.uuid().optional(),
	properties: z.record(z.string(), z.unknown()).optional(),
	attribution: z.record(z.string(), z.unknown()).optional(),
});

const creditTopUpInputSchema = z.object({
	pack: z.enum(["small", "medium", "large"]).optional(),
	amountCents: z.number().int().positive().optional(),
	savePaymentMethod: z.boolean().optional(),
	billingEmail: z.string().email(),
	billingName: z.string().min(1).max(200).optional(),
});

const autoRechargeInputSchema = z.object({
	enabled: z.boolean(),
	thresholdMicros: z.number().int().nonnegative().optional(),
	amountCents: z.number().int().positive().optional(),
});

// Customer API. Both bodies are deliberately one field: these are the two
// endpoints an unauthenticated stranger can reach, so the parse surface is kept
// as small as the operation allows.
const customerSignInRequestSchema = z.object({
	email: z.email().max(320),
});
const customerVerifySchema = z.object({
	token: z.string().min(16).max(512),
});

export const REQUEST_SCHEMAS: Record<string, z.ZodType> = {
	// `captureCheckoutPayment` is intentionally absent: the provider order id is
	// the path parameter and the stored payment chooses provider + merchant.
	requestCustomerSignInLink: customerSignInRequestSchema,
	verifyCustomerSignInLink: customerVerifySchema,
	// Same shape as a sign-in link: one opaque single-use token and nothing else.
	// `requestPortalHandoff` is deliberately absent — it is declared bodyless,
	// because who the ticket is for comes from the session, and a body would only
	// offer a caller somewhere to name a different customer.
	redeemPortalHandoff: customerVerifySchema,
	// Client records
	saveView: savedViewInputSchema,
	pinSavedView: savedViewPinSchema,
	recordProductEvent: productEventInputSchema,
	createCreditTopUp: creditTopUpInputSchema,
	setAutoRecharge: autoRechargeInputSchema,
	createClient: clientRecordInputSchema,
	updateClient: clientRecordPatchSchema,
	createClientAddress: clientAddressInputSchema,
	updateClientAddress: clientAddressPatchSchema,

	// Catalog
	createCatalogItem: catalogItemInputSchema,
	getCatalogAvailability: catalogAvailabilityInputSchema,
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
	createShippingZone: shippingZoneInputSchema,
	updateShippingZone: shippingZonePatchSchema,
	createShippingRate: shippingRateInputSchema,
	updateShippingRate: shippingRatePatchSchema,
	quoteShipping: z.object({
		items: checkoutInputSchema.shape.items,
		destination: shippingDestinationSchema,
		discountCode: checkoutInputSchema.shape.discountCode,
	}),

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
	createOrganization: createOrganizationSchema,
	createApiKey: createApiKeySchema,
	updateApiKeyOrigins: updateApiKeyOriginsSchema,
	startSubscription: startSubscriptionSchema,
	confirmAccountSubscription: confirmSubscriptionSchema,
	recommendAccountOnboarding: recommendationSchema,
	createWorkspace: createWorkspaceSchema,
	renameWorkspace: renameWorkspaceSchema,
	setWorkspaceArchived: archiveWorkspaceSchema,
	setWorkspaceModuleEnabled: workspaceModuleSchema,
	startPaymentOnboarding: paymentOnboardingInputSchema,
	setDefaultPaymentProvider: paymentProviderInputSchema,
	createCheckout: checkoutInputSchema,
	// ⚠️ Declared inline rather than imported from a module package: contact is
	// not a domain module and has no schema to borrow. Keep it in step with
	// `contactSchema` in `contact-routes.ts` — they are the same contract stated
	// twice, and only the route file's copy is enforced.
	submitContact: z.object({
		name: z.string().min(1).max(120),
		email: z.string().min(3).max(254),
		topic: z.string().min(1).max(80),
		message: z.string().min(10).max(4000),
		website: z.string().max(0).optional(),
	}),
	// getCustomerOrder is a GET whose UUID lives in the path; it deliberately has no body.
	createDiscount: discountInputSchema,
	updateDiscount: discountPatchSchema,
	previewDiscount: discountPreviewInputSchema,
	upsertContentEntry: contentEntryInputSchema,
	createCategory: categoryInputSchema,
	setPortalDomain: portalDomainInputSchema,
	createCustomerConversation: customerConversationInputSchema,
	replyToCustomerConversation: customerMessageInputSchema,
	createOperatorCustomerConversation: operatorConversationInputSchema,
	replyToOperatorCustomerConversation: customerMessageInputSchema,
	setCustomerConversationStatus: conversationStatusInputSchema,
	createReview: reviewInputSchema,
	moderateReview: reviewModerationSchema,
	reviewSummary: reviewSummaryInputSchema,
	addToWishlist: wishlistItemInputSchema,
	mergeWishlist: wishlistMergeInputSchema,
	updateCategory: categoryPatchSchema,
	setItemCategories: itemCategoriesInputSchema,
	registerContentManifest: contentManifestInputSchema,
	setContentPublished: contentPublishInputSchema,
	createRole: roleInputSchema,
	updateRole: rolePatchSchema,
};
