import {
	and,
	bookings,
	clientRecords,
	contracts,
	db,
	eq,
	fulfillments,
	inArray,
	inventoryItems,
	invoices,
	orders,
	payments,
	projects,
	quickengineWorkspaces,
	sql,
	workspaceModules,
} from "@quickengine/db";
import { type ReportRangeInput, reportRangeInputSchema } from "./range";
import { getRevenueSeries, getTrafficSeries } from "./series";
import { getTrafficSummary } from "./traffic";

const moduleIds = {
	clients: "client-records",
	invoices: "invoicing",
	payments: "payments",
	fulfillments: "fulfillment",
	orders: "orders",
	inventory: "inventory",
	projects: "projects-tasks",
	bookings: "bookings",
	contracts: "contracts-esign",
} as const;

type ReportSection<T> =
	| { available: true; data: T }
	| { available: false; data: null };

function section<T>(available: boolean, data: T): ReportSection<T> {
	return available
		? { available: true, data }
		: { available: false, data: null };
}

export async function getWorkspaceReport(
	workspaceId: string,
	input: ReportRangeInput,
) {
	const range = reportRangeInputSchema.parse(input);
	const from = range.from.toISOString();
	const to = range.to.toISOString();
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id, name: quickengineWorkspaces.name })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

	const configured = await db
		.select({ moduleId: workspaceModules.moduleId })
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				eq(workspaceModules.enabled, true),
				inArray(workspaceModules.moduleId, Object.values(moduleIds)),
			),
		);
	const enabled = new Set(configured.map((item) => item.moduleId));
	const has = (id: (typeof moduleIds)[keyof typeof moduleIds]) =>
		enabled.has(id);

	const [
		clientData,
		invoiceData,
		paymentData,
		orderData,
		fulfillmentData,
		projectData,
		bookingData,
		contractData,
		inventoryData,
		trafficData,
		revenueSeries,
		trafficSeries,
	] = await Promise.all([
		has(moduleIds.clients)
			? db
					.select({
						total: sql<number>`count(*)::int`,
						newInRange: sql<number>`count(*) filter (where ${clientRecords.createdAt} >= ${from}::timestamptz and ${clientRecords.createdAt} < ${to}::timestamptz)::int`,
					})
					.from(clientRecords)
					.where(eq(clientRecords.workspaceId, workspaceId))
					.then((rows) => rows[0] ?? { total: 0, newInRange: 0 })
			: Promise.resolve({ total: 0, newInRange: 0 }),
		has(moduleIds.invoices)
			? db
					.select({
						currency: invoices.currency,
						issued: sql<number>`count(*) filter (where ${invoices.issuedAt} >= ${from}::timestamptz and ${invoices.issuedAt} < ${to}::timestamptz)::int`,
						paid: sql<number>`count(*) filter (where ${invoices.paidAt} >= ${from}::timestamptz and ${invoices.paidAt} < ${to}::timestamptz)::int`,
						paidCents: sql<string>`coalesce(sum(${invoices.totalCents}) filter (where ${invoices.paidAt} >= ${from}::timestamptz and ${invoices.paidAt} < ${to}::timestamptz), 0)::text`,
						outstandingCents: sql<string>`coalesce(sum(${invoices.totalCents}) filter (where ${invoices.status} = 'sent'), 0)::text`,
					})
					.from(invoices)
					.where(eq(invoices.workspaceId, workspaceId))
					.groupBy(invoices.currency)
			: Promise.resolve([]),
		has(moduleIds.payments)
			? db
					.select({
						currency: payments.currency,
						collectedCount: sql<number>`count(*) filter (where ${payments.succeededAt} >= ${from}::timestamptz and ${payments.succeededAt} < ${to}::timestamptz)::int`,
						collectedCents: sql<string>`coalesce(sum(${payments.amountCents}) filter (where ${payments.succeededAt} >= ${from}::timestamptz and ${payments.succeededAt} < ${to}::timestamptz), 0)::text`,
						refundedCount: sql<number>`count(*) filter (where ${payments.refundedAt} >= ${from}::timestamptz and ${payments.refundedAt} < ${to}::timestamptz)::int`,
						refundedCents: sql<string>`coalesce(sum(${payments.amountCents}) filter (where ${payments.refundedAt} >= ${from}::timestamptz and ${payments.refundedAt} < ${to}::timestamptz), 0)::text`,
					})
					.from(payments)
					.where(eq(payments.workspaceId, workspaceId))
					.groupBy(payments.currency)
			: Promise.resolve([]),
		has(moduleIds.orders)
			? db
					.select({
						currency: orders.currency,
						placed: sql<number>`count(*) filter (where ${orders.placedAt} >= ${from}::timestamptz and ${orders.placedAt} < ${to}::timestamptz)::int`,
						fulfilled: sql<number>`count(*) filter (where ${orders.fulfilledAt} >= ${from}::timestamptz and ${orders.fulfilledAt} < ${to}::timestamptz)::int`,
						placedCents: sql<string>`coalesce(sum(${orders.totalCents}) filter (where ${orders.placedAt} >= ${from}::timestamptz and ${orders.placedAt} < ${to}::timestamptz and ${orders.status} <> 'cancelled'), 0)::text`,
					})
					.from(orders)
					.where(eq(orders.workspaceId, workspaceId))
					.groupBy(orders.currency)
			: Promise.resolve([]),
		has(moduleIds.fulfillments)
			? db
					.select({
						pending: sql<number>`count(*) filter (where ${fulfillments.status} in ('pending', 'in_progress'))::int`,
						completedInRange: sql<number>`count(*) filter (where ${fulfillments.fulfilledAt} >= ${from}::timestamptz and ${fulfillments.fulfilledAt} < ${to}::timestamptz)::int`,
						overdue: sql<number>`count(*) filter (where ${fulfillments.status} in ('pending', 'in_progress') and ${fulfillments.dueAt} < ${to}::timestamptz)::int`,
					})
					.from(fulfillments)
					.where(eq(fulfillments.workspaceId, workspaceId))
					.then(
						(rows) =>
							rows[0] ?? { pending: 0, completedInRange: 0, overdue: 0 },
					)
			: Promise.resolve({ pending: 0, completedInRange: 0, overdue: 0 }),
		has(moduleIds.projects)
			? db
					.select({
						active: sql<number>`count(*) filter (where ${projects.status} in ('active', 'on_hold'))::int`,
						completedInRange: sql<number>`count(*) filter (where ${projects.completedAt} >= ${from}::timestamptz and ${projects.completedAt} < ${to}::timestamptz)::int`,
					})
					.from(projects)
					.where(eq(projects.workspaceId, workspaceId))
					.then((rows) => rows[0] ?? { active: 0, completedInRange: 0 })
			: Promise.resolve({ active: 0, completedInRange: 0 }),
		has(moduleIds.bookings)
			? db
					.select({
						scheduledInRange: sql<number>`count(*) filter (where ${bookings.startsAt} >= ${from}::timestamptz and ${bookings.startsAt} < ${to}::timestamptz and ${bookings.status} not in ('cancelled', 'no_show'))::int`,
						completedInRange: sql<number>`count(*) filter (where ${bookings.completedAt} >= ${from}::timestamptz and ${bookings.completedAt} < ${to}::timestamptz)::int`,
						noShowsInRange: sql<number>`count(*) filter (where ${bookings.noShowAt} >= ${from}::timestamptz and ${bookings.noShowAt} < ${to}::timestamptz)::int`,
					})
					.from(bookings)
					.where(eq(bookings.workspaceId, workspaceId))
					.then(
						(rows) =>
							rows[0] ?? {
								scheduledInRange: 0,
								completedInRange: 0,
								noShowsInRange: 0,
							},
					)
			: Promise.resolve({
					scheduledInRange: 0,
					completedInRange: 0,
					noShowsInRange: 0,
				}),
		has(moduleIds.contracts)
			? db
					.select({
						awaitingSignature: sql<number>`count(*) filter (where ${contracts.status} in ('sent', 'partially_signed'))::int`,
						completedInRange: sql<number>`count(*) filter (where ${contracts.completedAt} >= ${from}::timestamptz and ${contracts.completedAt} < ${to}::timestamptz)::int`,
					})
					.from(contracts)
					.where(eq(contracts.workspaceId, workspaceId))
					.then(
						(rows) => rows[0] ?? { awaitingSignature: 0, completedInRange: 0 },
					)
			: Promise.resolve({ awaitingSignature: 0, completedInRange: 0 }),
		has(moduleIds.inventory)
			? db
					.select({
						activeItems: sql<number>`count(*) filter (where ${inventoryItems.status} = 'active')::int`,
						lowStockItems: sql<number>`count(*) filter (where ${inventoryItems.status} = 'active' and (${inventoryItems.onHand} - ${inventoryItems.reserved}) <= ${inventoryItems.lowStockThreshold})::int`,
					})
					.from(inventoryItems)
					.where(eq(inventoryItems.workspaceId, workspaceId))
					.then((rows) => rows[0] ?? { activeItems: 0, lowStockItems: 0 })
			: Promise.resolve({ activeItems: 0, lowStockItems: 0 }),
		getTrafficSummary(workspaceId, range),
		has(moduleIds.payments)
			? getRevenueSeries(workspaceId, range)
			: Promise.resolve({ collected: [], refunded: [] }),
		getTrafficSeries(workspaceId, range),
	]);

	return {
		workspace,
		range,
		clients: section(has(moduleIds.clients), clientData),
		invoices: section(has(moduleIds.invoices), invoiceData),
		payments: section(has(moduleIds.payments), paymentData),
		revenueSeries: section(has(moduleIds.payments), revenueSeries),
		orders: section(has(moduleIds.orders), orderData),
		fulfillment: section(has(moduleIds.fulfillments), fulfillmentData),
		projects: section(has(moduleIds.projects), projectData),
		bookings: section(has(moduleIds.bookings), bookingData),
		contracts: section(has(moduleIds.contracts), contractData),
		inventory: section(has(moduleIds.inventory), inventoryData),
		traffic: {
			available: true as const,
			data: { summary: trafficData, series: trafficSeries },
		},
	};
}
