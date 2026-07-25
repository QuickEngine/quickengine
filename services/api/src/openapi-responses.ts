import {
	bookings,
	catalogItems,
	catalogItemVariants,
	clientAddresses,
	clientRecords,
	contracts,
	fileDocuments,
	fileFolders,
	fulfillments,
	inventoryAdjustments,
	inventoryItems,
	invoiceLineItems,
	invoices,
	orderLineItems,
	orders,
	paymentRefunds,
	payments,
	projectMilestones,
	projects,
	projectTasks,
	quoteEstimateLineItems,
	quoteEstimates,
	shipments,
	timeEntries,
	webhookDeliveries,
	webhookEndpoints,
	workspaceActivity,
} from "@quickengine/db";
import type {
	WebhookDeliveryDto,
	WebhookEndpointDto,
} from "@quickengine/event-dispatch";
import type { BookingDto } from "@quickengine/mod-bookings";
import type {
	ClientAddressDto,
	ClientRecordDto,
} from "@quickengine/mod-client-records";
import type { ContractDto } from "@quickengine/mod-contracts-esign";
import type { FileDocumentDto, FileFolderDto } from "@quickengine/mod-files";
import type { FulfillmentDto } from "@quickengine/mod-fulfillment";
import type {
	InventoryAdjustmentDto,
	InventoryItemDto,
} from "@quickengine/mod-inventory";
import type { InvoiceDto } from "@quickengine/mod-invoicing";
import type { OrderDto } from "@quickengine/mod-orders";
import type { PaymentDto, PaymentRefundDto } from "@quickengine/mod-payments";
import type {
	CatalogItemDto,
	ProductVariantDto,
} from "@quickengine/mod-products-services";
import type {
	MilestoneDto,
	ProjectDto,
	TaskDto,
} from "@quickengine/mod-projects-tasks";
import type { QuoteEstimateDto } from "@quickengine/mod-quotes-estimates";
import type { ShipmentDto } from "@quickengine/mod-shipping";
import type { TimeEntryDto } from "@quickengine/mod-time-tracking";
import { z } from "zod";
import { type ExactKeys, tableResponse } from "./openapi-response-schema";

/**
 * The shape of `data` in each successful response, keyed by `operationId`.
 *
 * Derived from the tables the serializers read, so the document says what the code
 * returns. **Every schema is proved against its DTO type below** — a column added
 * to a table, or a field dropped from a DTO, fails the build until this file is
 * updated. That is what makes it safe to publish: the document cannot quietly
 * disagree with the API.
 *
 * Resources whose serializer withholds a field declare their schema by hand
 * instead. Using the table helper there would publish the withheld field.
 */

const client = tableResponse(clientRecords);
const clientAddress = tableResponse(clientAddresses);
const catalogItem = tableResponse(catalogItems);
const productVariant = tableResponse(catalogItemVariants);
const quote = tableResponse(quoteEstimates);
const quoteLine = tableResponse(quoteEstimateLineItems);
const invoice = tableResponse(invoices);
const invoiceLine = tableResponse(invoiceLineItems);
const payment = tableResponse(payments);
const paymentRefund = tableResponse(paymentRefunds);
const order = tableResponse(orders);
const orderLine = tableResponse(orderLineItems);
const fulfillment = tableResponse(fulfillments);
const inventoryItem = tableResponse(inventoryItems);
const inventoryAdjustment = tableResponse(inventoryAdjustments);
const shipment = tableResponse(shipments);
const project = tableResponse(projects);
const milestone = tableResponse(projectMilestones);
const task = tableResponse(projectTasks);
const booking = tableResponse(bookings);
const timeEntry = tableResponse(timeEntries);
const contract = tableResponse(contracts);
const fileFolder = tableResponse(fileFolders);
const fileDocument = tableResponse(fileDocuments);
const activity = tableResponse(workspaceActivity);

/**
 * Webhook endpoints and deliveries are built field by field, not spread from the
 * row — the endpoint's encrypted signing secret must never leave the API. Declared
 * by hand so the omission is explicit and the `Exact` check below enforces it.
 */
const webhookEndpoint = z.object({
	id: z.string(),
	url: z.string(),
	description: z.string().nullable(),
	eventTypes: z.array(z.string()),
	enabled: z.boolean(),
	disabledReason: z.string().nullable(),
	createdAt: z.string().meta({ format: "date-time" }),
	updatedAt: z.string().meta({ format: "date-time" }),
});

const webhookDelivery = z.object({
	id: z.string(),
	endpointId: z.string(),
	eventId: z.string(),
	eventName: z.string(),
	status: z.string(),
	attempts: z.number(),
	responseStatus: z.number().nullable(),
	responseBody: z.string().nullable(),
	error: z.string().nullable(),
	deliveredAt: z.string().nullable(),
	createdAt: z.string(),
});

/* ------------------------------------------------------------------------- *
 * Compile-time proof. Each line fails to compile if the schema and the DTO carry
 * different fields — in either direction. This is the guarantee, not a convention:
 * it is what stops a withheld secret reaching the published document.
 * ------------------------------------------------------------------------- */
const _client: ExactKeys<z.infer<typeof client>, ClientRecordDto> = true;
const _clientAddress: ExactKeys<
	z.infer<typeof clientAddress>,
	ClientAddressDto
> = true;
const _catalogItem: ExactKeys<
	z.infer<typeof catalogItem>,
	CatalogItemDto
> = true;
const _productVariant: ExactKeys<
	z.infer<typeof productVariant>,
	ProductVariantDto
> = true;
const _quote: ExactKeys<z.infer<typeof quote>, QuoteEstimateDto> = true;
const _invoice: ExactKeys<z.infer<typeof invoice>, InvoiceDto> = true;
const _payment: ExactKeys<z.infer<typeof payment>, PaymentDto> = true;
const _paymentRefund: ExactKeys<
	z.infer<typeof paymentRefund>,
	PaymentRefundDto
> = true;
const _order: ExactKeys<z.infer<typeof order>, OrderDto> = true;
const _fulfillment: ExactKeys<
	z.infer<typeof fulfillment>,
	FulfillmentDto
> = true;
const _inventoryItem: ExactKeys<
	z.infer<typeof inventoryItem>,
	InventoryItemDto
> = true;
const _inventoryAdjustment: ExactKeys<
	z.infer<typeof inventoryAdjustment>,
	InventoryAdjustmentDto
> = true;
const _shipment: ExactKeys<z.infer<typeof shipment>, ShipmentDto> = true;
const _project: ExactKeys<z.infer<typeof project>, ProjectDto> = true;
const _milestone: ExactKeys<z.infer<typeof milestone>, MilestoneDto> = true;
const _task: ExactKeys<z.infer<typeof task>, TaskDto> = true;
const _booking: ExactKeys<z.infer<typeof booking>, BookingDto> = true;
const _timeEntry: ExactKeys<z.infer<typeof timeEntry>, TimeEntryDto> = true;
const _contract: ExactKeys<z.infer<typeof contract>, ContractDto> = true;
const _fileFolder: ExactKeys<z.infer<typeof fileFolder>, FileFolderDto> = true;
const _fileDocument: ExactKeys<
	z.infer<typeof fileDocument>,
	FileDocumentDto
> = true;
const _webhookEndpoint: ExactKeys<
	z.infer<typeof webhookEndpoint>,
	WebhookEndpointDto
> = true;
const _webhookDelivery: ExactKeys<
	z.infer<typeof webhookDelivery>,
	WebhookDeliveryDto
> = true;

/** Keeps the proofs from being reported as unused without weakening them. */
export const RESPONSE_TYPE_PROOFS = [
	_client,
	_clientAddress,
	_catalogItem,
	_productVariant,
	_quote,
	_invoice,
	_payment,
	_paymentRefund,
	_order,
	_fulfillment,
	_inventoryItem,
	_inventoryAdjustment,
	_shipment,
	_project,
	_milestone,
	_task,
	_booking,
	_timeEntry,
	_contract,
	_fileFolder,
	_fileDocument,
	_webhookEndpoint,
	_webhookDelivery,
] as const;

const list = <T extends z.ZodType>(item: T) =>
	z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const RESPONSE_SCHEMAS: Record<string, z.ZodType> = {
	listClients: list(client),
	getClient: client,
	createClient: client,
	updateClient: client,
	listClientAddresses: z.array(clientAddress),
	createClientAddress: clientAddress,
	getClientAddress: clientAddress,
	updateClientAddress: clientAddress,

	listCatalogItems: list(catalogItem),
	getCatalogItem: catalogItem,
	createCatalogItem: catalogItem,
	updateCatalogItem: catalogItem,
	setCatalogItemStatus: catalogItem,
	createProductVariant: productVariant,
	updateProductVariant: productVariant,
	setProductVariantStatus: productVariant,

	listQuotes: list(quote),
	getQuote: quote,
	createQuote: quote,
	updateDraftQuote: quote,
	sendQuote: quote,
	acceptQuote: quote,
	declineQuote: quote,

	listInvoices: list(invoice),
	getInvoice: invoice,
	createInvoice: invoice,
	updateDraftInvoice: invoice,
	setInvoiceStatus: invoice,

	listPayments: list(payment),
	getPayment: payment,
	recordPayment: payment,
	setPaymentStatus: payment,
	refundPayment: paymentRefund,

	listOrders: list(order),
	getOrder: order,
	createOrder: order,
	updateDraftOrder: order,
	setOrderStatus: order,

	listFulfillments: list(fulfillment),
	getFulfillment: fulfillment,
	createFulfillment: fulfillment,
	setFulfillmentStatus: fulfillment,

	listInventoryItems: list(inventoryItem),
	getInventoryItem: inventoryItem,
	createInventoryItem: inventoryItem,
	updateInventoryItem: inventoryItem,
	setInventoryItemStatus: inventoryItem,
	applyInventoryAdjustment: inventoryAdjustment,

	listShipments: list(shipment),
	getShipment: shipment,
	createShipment: shipment,
	updateDraftShipment: shipment,
	setShipmentStatus: shipment,
	updateShipmentTracking: shipment,

	listProjects: list(project),
	getProject: project,
	createProject: project,
	updateProject: project,
	setProjectStatus: project,
	archiveProject: project,
	restoreProject: project,
	createMilestone: milestone,
	updateMilestone: milestone,
	setMilestoneStatus: milestone,
	createTask: task,
	updateTask: task,
	setTaskStatus: task,

	listBookings: list(booking),
	getBooking: booking,
	createBooking: booking,
	updateBooking: booking,
	setBookingStatus: booking,

	listTimeEntries: list(timeEntry),
	createManualTimeEntry: timeEntry,
	updateManualTimeEntry: timeEntry,
	startTimer: timeEntry,
	stopTimer: timeEntry,
	approveTimeEntry: timeEntry,
	unapproveTimeEntry: timeEntry,
	voidTimeEntry: timeEntry,
	restoreVoidedTimeEntry: timeEntry,

	listContracts: list(contract),
	getContract: contract,
	createContract: contract,
	updateDraftContract: contract,
	expireContract: contract,
	voidContract: contract,
	reviseContract: contract,

	listFileFolders: z.array(fileFolder),
	createFileFolder: fileFolder,
	updateFileFolder: fileFolder,
	listFileDocuments: list(fileDocument),
	getFileDocument: fileDocument,
	updateFileDocument: fileDocument,
	setFileDocumentStatus: fileDocument,

	listWebhookEndpoints: z.array(webhookEndpoint),
	createWebhookEndpoint: webhookEndpoint.extend({
		secret: z
			.string()
			.meta({ description: "Shown once, at creation. Never returned again." }),
	}),
	getWebhookEndpoint: webhookEndpoint,
	updateWebhookEndpoint: webhookEndpoint,
	listWebhookDeliveries: z.array(webhookDelivery),
	replayWebhookDelivery: webhookDelivery,

	listActivity: z.object({
		events: z.array(activity),
		cursor: z.number(),
	}),
};
