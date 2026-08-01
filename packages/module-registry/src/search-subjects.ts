import { getBooking } from "@quickengine/mod-bookings";
import { getClientRecord } from "@quickengine/mod-client-records";
import { getContract } from "@quickengine/mod-contracts-esign";
import { getFulfillment } from "@quickengine/mod-fulfillment";
import { getInvoice } from "@quickengine/mod-invoicing";
import { getOrder } from "@quickengine/mod-orders";
import { getPayment } from "@quickengine/mod-payments";
import { getCatalogItem } from "@quickengine/mod-products-services";
import { getMilestone, getProject } from "@quickengine/mod-projects-tasks";
import { getQuoteEstimate } from "@quickengine/mod-quotes-estimates";
import { getShipment } from "@quickengine/mod-shipping";

/**
 * What a record looks like in search results.
 *
 * `null` means the record is gone. A later delete event removes it from the
 * index, so a miss here is not an error.
 */
export type SearchableRecord = {
	title: string;
	description?: string;
};

export type SearchSubject = {
	/** The module id, used for the result URL and its icon. */
	module: string;
	/** Reads CURRENT state. Never trust the event payload — it may be stale. */
	read(
		workspaceId: string,
		id: string,
	): Promise<SearchableRecord | null | undefined>;
};

const text = (value: unknown): string | undefined => {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

/** Joins the parts of a subtitle, dropping the ones a record does not have. */
const detail = (...parts: unknown[]): string | undefined => {
	const joined = parts.map(text).filter(Boolean).join(" · ");
	return joined.length > 0 ? joined : undefined;
};

/**
 * Which domain events feed the search index, keyed by the event name's prefix.
 *
 * 🔑 This lives in `module-registry` rather than in `event-dispatch` on purpose.
 * The registry already depends on every module, so each one keeps ownership of
 * how its own records are read. The alternative — `event-dispatch` querying other
 * modules' tables directly — would have been fewer lines and would have broken
 * the module boundary that the rest of the codebase maintains.
 *
 * **Adding a module is one entry.** Before this existed, `searchHandler` matched
 * `client.` and nothing else, so fourteen of fifteen modules were unsearchable
 * while the index itself worked perfectly.
 *
 * Not every module belongs here. Inventory rows carry no label of their own —
 * they are stock against a catalog item that is already searchable, so indexing
 * them would return two results for one product. `time-tracking` entries and
 * `files` are likewise not meaningfully searchable by name. A record nobody
 * would search for by title is noise in a palette, not coverage.
 */
export const SEARCH_SUBJECTS: Readonly<Record<string, SearchSubject>> = {
	client: {
		module: "client-records",
		async read(workspaceId, id) {
			const record = await getClientRecord(workspaceId, id);
			if (!record) return null;
			return {
				title: record.name,
				description: detail(record.email, record.company),
			};
		},
	},
	"catalog-item": {
		module: "products-services",
		async read(workspaceId, id) {
			const item = await getCatalogItem(workspaceId, id);
			if (!item) return null;
			return { title: item.name, description: detail(item.sku, item.type) };
		},
	},
	invoice: {
		module: "invoicing",
		async read(workspaceId, id) {
			const invoice = await getInvoice(workspaceId, id);
			if (!invoice) return null;
			return {
				title: text(invoice.number) ?? "Invoice",
				description: detail(invoice.status),
			};
		},
	},
	order: {
		module: "orders",
		async read(workspaceId, id) {
			const order = await getOrder(workspaceId, id);
			if (!order) return null;
			return {
				title: text(order.number) ?? "Order",
				description: detail(order.status),
			};
		},
	},
	quote: {
		module: "quotes-estimates",
		async read(workspaceId, id) {
			const quote = await getQuoteEstimate(workspaceId, id);
			if (!quote) return null;
			return {
				title: text(quote.title) ?? text(quote.number) ?? "Quote",
				description: detail(quote.number, quote.status),
			};
		},
	},
	booking: {
		module: "bookings",
		async read(workspaceId, id) {
			const booking = await getBooking(workspaceId, id);
			if (!booking) return null;
			return {
				title: text(booking.title) ?? "Booking",
				description: detail(booking.status),
			};
		},
	},
	project: {
		module: "projects-tasks",
		async read(workspaceId, id) {
			const project = await getProject(workspaceId, id);
			if (!project) return null;
			return {
				title: project.name,
				description: detail(project.status),
			};
		},
	},
	milestone: {
		module: "projects-tasks",
		async read(workspaceId, id) {
			const milestone = await getMilestone(workspaceId, id);
			if (!milestone) return null;
			return { title: milestone.name, description: detail(milestone.status) };
		},
	},
	shipment: {
		module: "shipping",
		async read(workspaceId, id) {
			const shipment = await getShipment(workspaceId, id);
			if (!shipment) return null;
			return {
				title: text(shipment.trackingNumber) ?? "Shipment",
				description: detail(shipment.carrier, shipment.status),
			};
		},
	},
	contract: {
		module: "contracts-esign",
		async read(workspaceId, id) {
			const contract = await getContract(workspaceId, id);
			if (!contract) return null;
			return { title: contract.title, description: detail(contract.status) };
		},
	},
	fulfillment: {
		module: "fulfillment",
		async read(workspaceId, id) {
			const fulfillment = await getFulfillment(workspaceId, id);
			if (!fulfillment) return null;
			return {
				title: text(fulfillment.title) ?? "Fulfillment",
				description: detail(fulfillment.status),
			};
		},
	},
	payment: {
		module: "payments",
		async read(workspaceId, id) {
			const payment = await getPayment(workspaceId, id);
			if (!payment) return null;
			return {
				title: text(payment.reference) ?? "Payment",
				description: detail(payment.status),
			};
		},
	},
};

/**
 * The subject an event belongs to, or `undefined` if it feeds nothing.
 *
 * Matches on the segment before the first dot, so `client.address.updated`
 * resolves to `client` — which is why the handler still has to skip the
 * sub-entity events that change nothing indexed.
 */
export function searchSubjectFor(eventName: string): SearchSubject | undefined {
	const prefix = eventName.split(".")[0];
	return prefix ? SEARCH_SUBJECTS[prefix] : undefined;
}
