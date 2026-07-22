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
import { listProjects } from "@quickengine/mod-projects-tasks";
import { listQuoteEstimates } from "@quickengine/mod-quotes-estimates";
import { listShipments } from "@quickengine/mod-shipping";
import { listTimeEntries } from "@quickengine/mod-time-tracking";
import {
	type FirstActionCompletionDetectors,
	resolveFirstActionCompletions,
} from "./first-action-completion";

async function hasAny<T>(records: Promise<readonly T[]>) {
	return (await records).length > 0;
}

export const databaseFirstActionCompletionDetectors = {
	"client-records:create": (workspaceId) =>
		hasAny(listClientRecords(workspaceId)),
	"products-services:create": (workspaceId) =>
		hasAny(listCatalogItems(workspaceId)),
	"files:upload": (workspaceId) => hasAny(listFileDocuments(workspaceId)),
	"quotes-estimates:create": (workspaceId) =>
		hasAny(listQuoteEstimates(workspaceId)),
	"projects-tasks:create": (workspaceId) => hasAny(listProjects(workspaceId)),
	"invoicing:create": (workspaceId) => hasAny(listInvoices(workspaceId)),
	"bookings:create": (workspaceId) => hasAny(listBookings(workspaceId)),
	"orders:create": (workspaceId) => hasAny(listOrders(workspaceId)),
	"time-tracking:create": (workspaceId) => hasAny(listTimeEntries(workspaceId)),
	"inventory:adjust": hasInventoryAdjustments,
	"contracts-esign:create": (workspaceId) => hasAny(listContracts(workspaceId)),
	"payments:record": (workspaceId) => hasAny(listPayments(workspaceId)),
	"fulfillment:create": (workspaceId) => hasAny(listFulfillments(workspaceId)),
	"shipping:create": (workspaceId) => hasAny(listShipments(workspaceId)),
} satisfies FirstActionCompletionDetectors;

export function resolveDatabaseFirstActionCompletions(
	workspaceId: string,
	actionIds: readonly string[],
) {
	return resolveFirstActionCompletions(
		workspaceId,
		actionIds,
		databaseFirstActionCompletionDetectors,
	);
}
