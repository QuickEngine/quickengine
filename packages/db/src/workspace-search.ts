import {
	and,
	bookings,
	catalogCategories,
	catalogItems,
	clientRecords,
	contentEntries,
	contracts,
	db,
	discounts,
	eq,
	fileDocuments,
	ilike,
	invoices,
	or,
	orders,
	payments,
	projects,
	projectTasks,
	purchaseOrders,
	quoteEstimates,
	reviews,
	shipments,
	shippingRates,
	shippingZones,
	subscriptionPlans,
	suppliers,
	timeEntries,
} from "./index";

/**
 * Finding anything in a workspace, by asking the database.
 *
 * 🔴 NOT a search index. `/quickdash/search` used to query Algolia, and two
 * things were wrong with that: nothing in the codebase ever WROTE to the index,
 * and without credentials the provider returns an empty array — which reads to
 * a person as "you have nothing" rather than "search is not configured". So the
 * one control that promises to find anything found nothing, everywhere, and
 * looked like it was working.
 *
 * 🔑 Querying the tables directly fixes both at once. There is no index to keep
 * in sync (an index that drifts is worse than none — it confidently returns
 * records that no longer exist), no third party to pay, and it works offline,
 * on a laptop, and in production identically.
 *
 * ⚠️ It will not scale forever. `ILIKE '%term%'` cannot use a plain B-tree
 * index, so this is a sequential scan per table. Fine at a few thousand rows
 * per workspace and the honest thing to ship now; the upgrade is Postgres full
 * text search with a GIN index, which is a migration rather than a rewrite
 * because the shape of this function does not change.
 */

export type SearchKind =
	| "customer"
	| "order"
	| "product"
	| "invoice"
	| "quote"
	| "contract"
	| "booking"
	| "payment"
	| "shipment"
	| "supplier"
	| "purchase-order"
	| "project"
	| "task"
	| "discount"
	| "category"
	| "review"
	| "plan"
	| "time"
	| "file"
	| "content"
	| "zone"
	| "rate";

export type WorkspaceSearchHit = {
	objectID: string;
	/** What kind of thing was found, for the icon and the grouping. */
	kind: SearchKind;
	title: string;
	description?: string;
	/** Relative to the workspace, e.g. `products-services`. */
	url: string;
};

/** Per kind, so one busy table cannot crowd everything else out. */
const PER_KIND = 5;

export async function searchWorkspace(input: {
	workspaceId: string;
	query: string;
	/**
	 * 🔴 Sandbox and live never mix. Orders and payments carry a mode and a test
	 * one must not surface beside a real one. Everything else here is mode-less
	 * by nature — a product is a product — and needs no filter.
	 */
	environment: "test" | "live";
}): Promise<WorkspaceSearchHit[]> {
	const term = input.query.trim();
	if (term.length < 2) return [];
	// Escape the wildcards so a search for "50%" does not match everything.
	const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
	const ws = input.workspaceId;

	/**
	 * One declaration per resource, so adding a searchable thing is a row in
	 * this list rather than another hand-written query.
	 *
	 * ⚠️ `fields` are the columns matched, `title` the one shown, `detail` the
	 * line under it. Every column named here must be text — `ilike` on a number
	 * throws rather than failing to match.
	 */
	const sources = [
		{
			kind: "customer" as const,
			url: "client-records",
			table: clientRecords,
			title: clientRecords.name,
			detail: clientRecords.email,
			fields: [clientRecords.name, clientRecords.email, clientRecords.company],
		},
		{
			kind: "order" as const,
			url: "orders",
			table: orders,
			title: orders.number,
			detail: orders.clientName,
			fields: [
				orders.number,
				orders.clientName,
				orders.clientEmail,
				orders.discountCode,
				orders.shipToName,
				orders.shipToCity,
				orders.shipToPostalCode,
			],
			mode: orders.environment,
		},
		{
			kind: "product" as const,
			url: "products-services",
			table: catalogItems,
			title: catalogItems.name,
			detail: catalogItems.sku,
			fields: [catalogItems.name, catalogItems.sku, catalogItems.description],
		},
		{
			kind: "invoice" as const,
			url: "invoicing",
			table: invoices,
			title: invoices.number,
			detail: invoices.clientName,
			fields: [
				invoices.number,
				invoices.clientName,
				invoices.clientEmail,
				invoices.clientCompany,
				invoices.notes,
			],
		},
		{
			kind: "quote" as const,
			url: "quotes-estimates",
			table: quoteEstimates,
			title: quoteEstimates.number,
			detail: quoteEstimates.title,
			fields: [
				quoteEstimates.number,
				quoteEstimates.title,
				quoteEstimates.clientName,
				quoteEstimates.clientEmail,
				quoteEstimates.clientCompany,
			],
		},
		{
			kind: "contract" as const,
			url: "contracts-esign",
			table: contracts,
			title: contracts.title,
			detail: contracts.clientName,
			fields: [
				contracts.number,
				contracts.title,
				contracts.clientName,
				contracts.clientEmail,
				contracts.fileName,
			],
		},
		{
			kind: "booking" as const,
			url: "bookings",
			table: bookings,
			title: bookings.title,
			detail: bookings.clientName,
			fields: [
				bookings.title,
				bookings.clientName,
				bookings.clientEmail,
				bookings.location,
				bookings.notes,
			],
		},
		{
			kind: "payment" as const,
			url: "payments",
			table: payments,
			title: payments.reference,
			detail: payments.clientName,
			fields: [
				payments.reference,
				payments.clientName,
				payments.clientEmail,
				payments.externalPaymentId,
				payments.stripePaymentIntentId,
			],
			mode: payments.environment,
		},
		{
			kind: "shipment" as const,
			url: "shipping",
			table: shipments,
			title: shipments.trackingNumber,
			detail: shipments.carrier,
			fields: [
				shipments.trackingNumber,
				shipments.carrier,
				shipments.serviceLevel,
				shipments.destination,
			],
		},
		{
			kind: "supplier" as const,
			url: "inventory/suppliers",
			table: suppliers,
			title: suppliers.name,
			detail: suppliers.contactEmail,
			fields: [
				suppliers.name,
				suppliers.contactName,
				suppliers.contactEmail,
				suppliers.contactPhone,
				suppliers.notes,
			],
		},
		{
			kind: "purchase-order" as const,
			url: "inventory/purchase-orders",
			table: purchaseOrders,
			title: purchaseOrders.number,
			detail: purchaseOrders.supplierReference,
			fields: [
				purchaseOrders.number,
				purchaseOrders.supplierReference,
				purchaseOrders.trackingNumber,
				purchaseOrders.shipToName,
			],
		},
		{
			kind: "project" as const,
			url: "projects-tasks",
			table: projects,
			title: projects.name,
			detail: projects.clientName,
			fields: [projects.name, projects.description, projects.clientName],
		},
		{
			kind: "task" as const,
			url: "projects-tasks/tasks",
			table: projectTasks,
			title: projectTasks.title,
			detail: projectTasks.status,
			fields: [projectTasks.title, projectTasks.description],
		},
		{
			kind: "discount" as const,
			url: "orders/discounts",
			table: discounts,
			title: discounts.code,
			detail: discounts.name,
			fields: [discounts.code, discounts.name],
		},
		{
			kind: "category" as const,
			url: "products-services/categories",
			table: catalogCategories,
			title: catalogCategories.name,
			detail: catalogCategories.slug,
			fields: [
				catalogCategories.name,
				catalogCategories.slug,
				catalogCategories.description,
			],
		},
		{
			kind: "review" as const,
			url: "products-services/reviews",
			table: reviews,
			title: reviews.title,
			detail: reviews.authorName,
			fields: [reviews.title, reviews.body, reviews.authorName],
		},
		{
			kind: "plan" as const,
			url: "orders/subscriptions",
			table: subscriptionPlans,
			title: subscriptionPlans.name,
			detail: subscriptionPlans.interval,
			fields: [subscriptionPlans.name],
		},
		{
			kind: "time" as const,
			url: "time-tracking",
			table: timeEntries,
			title: timeEntries.description,
			detail: timeEntries.projectName,
			fields: [
				timeEntries.description,
				timeEntries.projectName,
				timeEntries.taskTitle,
				timeEntries.clientName,
			],
		},
		{
			kind: "file" as const,
			url: "files",
			table: fileDocuments,
			title: fileDocuments.title,
			detail: fileDocuments.description,
			fields: [fileDocuments.title, fileDocuments.description],
		},
		{
			kind: "content" as const,
			url: "content",
			table: contentEntries,
			title: contentEntries.label,
			detail: contentEntries.key,
			fields: [
				contentEntries.key,
				contentEntries.label,
				contentEntries.description,
			],
		},
		{
			kind: "zone" as const,
			url: "shipping/zones",
			table: shippingZones,
			title: shippingZones.name,
			detail: shippingZones.name,
			fields: [shippingZones.name],
		},
		{
			kind: "rate" as const,
			url: "shipping/rates",
			table: shippingRates,
			title: shippingRates.name,
			detail: shippingRates.description,
			fields: [shippingRates.name, shippingRates.description],
		},
	];

	const found = await Promise.all(
		sources.map(async (source) => {
			const where = and(
				eq((source.table as unknown as typeof orders).workspaceId, ws),
				source.mode ? eq(source.mode, input.environment) : undefined,
				or(...source.fields.map((field) => ilike(field, like))),
			);
			try {
				/**
				 * ⚠️ The table is cast to a concrete one purely so the query builder
				 * can infer. Every source has `id` and `workspaceId` — that is what
				 * makes the list uniform — but a union of ninety table types is not
				 * something the builder can resolve, and the alternative is ninety
				 * hand-written queries that drift.
				 */
				const rows = (await db
					.select({
						id: (source.table as unknown as typeof orders).id,
						title: source.title,
						detail: source.detail,
					})
					.from(source.table as unknown as typeof orders)
					.where(where)
					.limit(PER_KIND)) as Array<{
					id: string;
					title: string | null;
					detail: string | null;
				}>;
				return rows.map((row) => ({
					objectID: row.id,
					kind: source.kind,
					// A record with no name still has to be findable — an untitled
					// contract is exactly the one somebody is hunting for.
					title: row.title ?? "Untitled",
					description: row.detail ?? undefined,
					url: source.url,
				}));
			} catch {
				/**
				 * 🔴 One table failing must not take the whole search down. These run
				 * against every module whether or not a workspace has it, and a
				 * search that returns nothing because one query threw is worse than
				 * one that returns everything else.
				 */
				return [];
			}
		}),
	);

	return found.flat();
}
