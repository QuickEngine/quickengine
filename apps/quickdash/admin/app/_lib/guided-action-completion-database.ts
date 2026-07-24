import { listBookings } from "@quickengine/mod-bookings";
import { listClientRecords } from "@quickengine/mod-client-records";
import { listContracts } from "@quickengine/mod-contracts-esign";
import { listFileDocuments } from "@quickengine/mod-files";
import { listFulfillments } from "@quickengine/mod-fulfillment";
import { hasInventoryAdjustments } from "@quickengine/mod-inventory";
import { listInvoices } from "@quickengine/mod-invoicing";
import { listOrders } from "@quickengine/mod-orders";
import { listPayments } from "@quickengine/mod-payments";
import { listCatalogItems } from "@quickengine/mod-products-services";
import {
	listProjects,
	listProjectTasks,
} from "@quickengine/mod-projects-tasks";
import { listQuoteEstimates } from "@quickengine/mod-quotes-estimates";
import { listShipments } from "@quickengine/mod-shipping";
import { listTimeEntries } from "@quickengine/mod-time-tracking";
import {
	type GuidedStepCompletionDetectors,
	guidedStatusPolicies,
	resolveGuidedStepCompletions,
} from "./guided-action-completion";

async function hasAny<T>(records: Promise<readonly T[]>) {
	return (await records).length > 0;
}

async function hasProjectTask(workspaceId: string) {
	const projects = await listProjects(workspaceId);
	const taskLists = await Promise.all(
		projects.map((project) => listProjectTasks(workspaceId, project.id)),
	);
	return taskLists.some((tasks) => tasks.length > 0);
}

export const databaseGuidedStepCompletionDetectors = {
	"client-records:create:details": (id) => hasAny(listClientRecords(id)),
	"products-services:create:offering": (id) => hasAny(listCatalogItems(id)),
	"files:upload:file": (id) => hasAny(listFileDocuments(id)),
	"invoicing:create:draft": (id) => hasAny(listInvoices(id)),
	"invoicing:create:send": async (id) =>
		(await listInvoices(id)).some((record) =>
			guidedStatusPolicies.nonDraft(record.status),
		),
	"payments:record:payment": (id) => hasAny(listPayments(id)),
	"fulfillment:create:start": (id) => hasAny(listFulfillments(id)),
	"fulfillment:create:complete": async (id) =>
		(await listFulfillments(id)).some((record) =>
			guidedStatusPolicies.fulfillmentComplete(record.status),
		),
	"quotes-estimates:create:draft": (id) => hasAny(listQuoteEstimates(id)),
	"quotes-estimates:create:send": async (id) =>
		(await listQuoteEstimates(id)).some((record) =>
			guidedStatusPolicies.nonDraft(record.status),
		),
	"projects-tasks:create:project": (id) => hasAny(listProjects(id)),
	"projects-tasks:create:task": hasProjectTask,
	"bookings:create:booking": (id) => hasAny(listBookings(id)),
	"bookings:create:confirm": async (id) =>
		(await listBookings(id)).some((record) =>
			guidedStatusPolicies.bookingConfirmed(record.status),
		),
	"orders:create:draft": (id) => hasAny(listOrders(id)),
	"orders:create:confirm": async (id) =>
		(await listOrders(id)).some((record) =>
			guidedStatusPolicies.orderConfirmed(record.status),
		),
	"time-tracking:create:entry": (id) => hasAny(listTimeEntries(id)),
	"time-tracking:create:review": async (id) =>
		(await listTimeEntries(id)).some((record) =>
			guidedStatusPolicies.timeReviewed(record.status),
		),
	"inventory:adjust:stock": hasInventoryAdjustments,
	"contracts-esign:create:draft": (id) => hasAny(listContracts(id)),
	"contracts-esign:create:send": async (id) =>
		(await listContracts(id)).some((record) =>
			guidedStatusPolicies.nonDraft(record.status),
		),
	"shipping:create:shipment": (id) => hasAny(listShipments(id)),
	"shipping:create:dispatch": async (id) =>
		(await listShipments(id)).some((record) =>
			guidedStatusPolicies.shipmentDispatched(record.status),
		),
} satisfies GuidedStepCompletionDetectors;

export function resolveDatabaseGuidedStepCompletions(
	workspaceId: string,
	stepIds: readonly string[],
) {
	return resolveGuidedStepCompletions(
		workspaceId,
		stepIds,
		databaseGuidedStepCompletionDetectors,
	);
}
