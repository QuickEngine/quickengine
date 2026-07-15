import { getSession } from "@quickengine/auth/server";
import {
	bookingsSettingsSchema,
	listBookings,
} from "@quickengine/mod-bookings";
import {
	clientRecordsSettingsSchema,
	listClientRecords,
} from "@quickengine/mod-client-records";
import {
	getFileDocument,
	listFileDocuments,
	listFileFolders,
} from "@quickengine/mod-files";
import {
	fulfillmentSettingsSchema,
	listFulfillments,
} from "@quickengine/mod-fulfillment";
import {
	inventorySettingsSchema,
	listInventoryAdjustments,
	listInventoryItems,
} from "@quickengine/mod-inventory";
import {
	getInvoice,
	invoicingSettingsSchema,
	listInvoices,
} from "@quickengine/mod-invoicing";
import {
	getOrder,
	listOrders,
	ordersSettingsSchema,
} from "@quickengine/mod-orders";
import {
	getPayment,
	listPayments,
	paymentsSettingsSchema,
} from "@quickengine/mod-payments";
import {
	listCatalogItems,
	listProductVariants,
	productsServicesSettingsSchema,
} from "@quickengine/mod-products-services";
import {
	listProjects,
	listProjectTasks,
} from "@quickengine/mod-projects-tasks";
import {
	getShipment,
	listShipments,
	shippingSettingsSchema,
} from "@quickengine/mod-shipping";
import {
	listTimeEntries,
	timeTrackingSettingsSchema,
} from "@quickengine/mod-time-tracking";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BookingsView } from "../../_components/bookings-view";
import { CatalogView } from "../../_components/catalog-view";
import { ClientRecordsView } from "../../_components/client-records-view";
import { FilesView } from "../../_components/files-view";
import { FulfillmentsView } from "../../_components/fulfillments-view";
import { InventoryView } from "../../_components/inventory-view";
import { InvoicesView } from "../../_components/invoices-view";
import { ModuleIcon } from "../../_components/module-icon";
import { OrdersView } from "../../_components/orders-view";
import { PaymentsView } from "../../_components/payments-view";
import { ProjectsView } from "../../_components/projects-view";
import { ShippingView } from "../../_components/shipping-view";
import { TimeTrackingView } from "../../_components/time-tracking-view";
import { getModuleNavigation } from "../../_lib/module-navigation";
import { requireWorkspaceAccess } from "../../_lib/workspace-access";

export default async function Page({
	params,
}: {
	params: Promise<{ workspace: string; module: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const { workspace: workspaceId, module: moduleId } = await params;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		notFound();
	}
	const enabledModule = access.modules.find((module) => module.id === moduleId);
	const navigation = getModuleNavigation(moduleId);
	if (!enabledModule || !navigation) {
		notFound();
	}
	const clientRecords =
		moduleId === "client-records"
			? await listClientRecords(access.workspace.id)
			: null;
	const clientSettings =
		moduleId === "client-records"
			? clientRecordsSettingsSchema.parse(enabledModule.settings)
			: null;
	const invoicingSettings =
		moduleId === "invoicing"
			? invoicingSettingsSchema.parse(enabledModule.settings)
			: null;
	const invoiceRows =
		moduleId === "invoicing" ? await listInvoices(access.workspace.id) : null;
	const invoiceDetails = invoiceRows
		? await Promise.all(
				invoiceRows.map((invoice) =>
					getInvoice(access.workspace.id, invoice.id),
				),
			)
		: null;
	const invoiceClients =
		moduleId === "invoicing"
			? await listClientRecords(access.workspace.id)
			: null;
	const paymentsSettings =
		moduleId === "payments"
			? paymentsSettingsSchema.parse(enabledModule.settings)
			: null;
	const paymentRows =
		moduleId === "payments" ? await listPayments(access.workspace.id) : null;
	const paymentDetails = paymentRows
		? await Promise.all(
				paymentRows.map((payment) =>
					getPayment(access.workspace.id, payment.id),
				),
			)
		: null;
	const paymentInvoices =
		moduleId === "payments" ? await listInvoices(access.workspace.id) : null;
	const paymentClients =
		moduleId === "payments"
			? await listClientRecords(access.workspace.id)
			: null;
	const fulfillmentSettings =
		moduleId === "fulfillment"
			? fulfillmentSettingsSchema.parse(enabledModule.settings)
			: null;
	const fulfillmentRows =
		moduleId === "fulfillment"
			? await listFulfillments(access.workspace.id)
			: null;
	const fulfillmentInvoices =
		moduleId === "fulfillment" ? await listInvoices(access.workspace.id) : null;
	const fulfillmentClients =
		moduleId === "fulfillment"
			? await listClientRecords(access.workspace.id)
			: null;
	const catalogSettings =
		moduleId === "products-services"
			? productsServicesSettingsSchema.parse(enabledModule.settings)
			: null;
	const catalogRows =
		moduleId === "products-services"
			? await listCatalogItems(access.workspace.id)
			: null;
	const catalogVariants = catalogRows
		? await Promise.all(
				catalogRows.map((item) =>
					listProductVariants(access.workspace.id, item.id),
				),
			)
		: null;
	const orderSettings =
		moduleId === "orders"
			? ordersSettingsSchema.parse(enabledModule.settings)
			: null;
	const orderRows =
		moduleId === "orders" ? await listOrders(access.workspace.id) : null;
	const orderDetails = orderRows
		? await Promise.all(
				orderRows.map((order) => getOrder(access.workspace.id, order.id)),
			)
		: null;
	const orderClients =
		moduleId === "orders" ? await listClientRecords(access.workspace.id) : null;
	const orderCatalog =
		moduleId === "orders"
			? (await listCatalogItems(access.workspace.id, "active")).filter(
					(item) => item.currency === orderSettings?.defaultCurrency,
				)
			: null;
	const orderCatalogVariants = orderCatalog
		? await Promise.all(
				orderCatalog.map((item) =>
					listProductVariants(access.workspace.id, item.id),
				),
			)
		: null;
	const inventorySettings =
		moduleId === "inventory"
			? inventorySettingsSchema.parse(enabledModule.settings)
			: null;
	const inventoryRows =
		moduleId === "inventory"
			? await listInventoryItems(access.workspace.id)
			: null;
	const inventoryMovements = inventoryRows
		? await Promise.all(
				inventoryRows.map((item) =>
					listInventoryAdjustments(access.workspace.id, item.id),
				),
			)
		: null;
	const inventoryCatalog =
		moduleId === "inventory"
			? await listCatalogItems(access.workspace.id)
			: null;
	const inventoryVariants = inventoryCatalog
		? await Promise.all(
				inventoryCatalog.map((item) =>
					listProductVariants(access.workspace.id, item.id),
				),
			)
		: null;
	const shippingSettings =
		moduleId === "shipping"
			? shippingSettingsSchema.parse(enabledModule.settings)
			: null;
	const shipmentRows =
		moduleId === "shipping" ? await listShipments(access.workspace.id) : null;
	const shipmentDetails = shipmentRows
		? await Promise.all(
				shipmentRows.map((shipment) =>
					getShipment(access.workspace.id, shipment.id),
				),
			)
		: null;
	const shippingOrderRows =
		moduleId === "shipping" ? await listOrders(access.workspace.id) : null;
	const shippingOrders = shippingOrderRows
		? await Promise.all(
				shippingOrderRows.map((order) =>
					getOrder(access.workspace.id, order.id),
				),
			)
		: null;
	const bookingsSettings =
		moduleId === "bookings"
			? bookingsSettingsSchema.parse(enabledModule.settings)
			: null;
	const bookingRows =
		moduleId === "bookings" ? await listBookings(access.workspace.id) : null;
	const bookingClients =
		moduleId === "bookings"
			? await listClientRecords(access.workspace.id)
			: null;
	const today = new Date();
	const fileFolders =
		moduleId === "files" ? await listFileFolders(access.workspace.id) : null;
	const fileRows =
		moduleId === "files"
			? await listFileDocuments(access.workspace.id, {
					includeArchived: true,
					includeTrashed: true,
				})
			: null;
	const fileDetails = fileRows
		? await Promise.all(
				fileRows.map((document) =>
					getFileDocument(access.workspace.id, document.id),
				),
			)
		: null;
	const timeSettings =
		moduleId === "time-tracking"
			? timeTrackingSettingsSchema.parse(enabledModule.settings)
			: null;
	const timeRows =
		moduleId === "time-tracking"
			? await listTimeEntries(access.workspace.id)
			: null;
	const timeProjects =
		moduleId === "time-tracking"
			? await listProjects(access.workspace.id)
			: null;
	const timeTasks = timeProjects
		? await Promise.all(
				timeProjects.map((project) =>
					listProjectTasks(access.workspace.id, project.id),
				),
			)
		: null;
	const projectRows =
		moduleId === "projects-tasks"
			? await listProjects(access.workspace.id)
			: null;
	const projectTasks = projectRows
		? await Promise.all(
				projectRows.map((p) => listProjectTasks(access.workspace.id, p.id)),
			)
		: null;
	const projectClients =
		moduleId === "projects-tasks"
			? await listClientRecords(access.workspace.id)
			: null;
	const defaultDueDate = invoicingSettings
		? new Date(
				today.getTime() + invoicingSettings.defaultDueInDays * 86_400_000,
			)
				.toISOString()
				.slice(0, 10)
		: "";
	return (
		<main className="p-6">
			<div className="flex items-start gap-4">
				<div className="flex size-11 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.04]">
					<ModuleIcon id={moduleId} className="size-5" />
				</div>
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-semibold text-2xl">{navigation.label}</h1>
						<Badge variant="secondary">Enabled</Badge>
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{enabledModule.description}
					</p>
				</div>
			</div>
			{fileFolders && fileDetails ? (
				<FilesView
					workspaceId={access.workspace.id}
					folders={fileFolders.map((folder) => ({
						id: folder.id,
						name: folder.name,
						parentId: folder.parentId,
					}))}
					documents={fileDetails.flatMap((document) => {
						if (!document) return [];
						const version = document.versions.find(
							(candidate) =>
								candidate.versionNumber === document.currentVersionNumber,
						);
						return [
							{
								id: document.id,
								title: document.title,
								description: document.description,
								folderId: document.folderId,
								status: document.status as "active" | "archived" | "trashed",
								tags: document.tags,
								version: version?.versionNumber ?? null,
								fileName: version?.originalName ?? null,
								category: version?.category ?? null,
								sizeBytes: version?.sizeBytes ?? null,
							},
						];
					})}
				/>
			) : timeRows && timeProjects && timeTasks && timeSettings ? (
				<TimeTrackingView
					workspaceId={access.workspace.id}
					defaultBillable={timeSettings.defaultBillable}
					defaultRateCents={timeSettings.defaultHourlyRateCents}
					projects={timeProjects
						.filter(
							(project) => !["completed", "cancelled"].includes(project.status),
						)
						.map((project, index) => ({
							id: project.id,
							name: project.name,
							tasks: (timeTasks[index] ?? [])
								.filter(
									(task) => !["completed", "cancelled"].includes(task.status),
								)
								.map((task) => ({ id: task.id, title: task.title })),
						}))}
					entries={timeRows.map((entry) => ({
						id: entry.id,
						projectName: entry.projectName,
						taskTitle: entry.taskTitle,
						description: entry.description,
						status: entry.status,
						durationSeconds: entry.durationSeconds,
						workDate: entry.workDate,
						billable: entry.billable,
						startedAt: entry.startedAt?.toISOString() ?? null,
					}))}
				/>
			) : projectRows && projectTasks && projectClients ? (
				<ProjectsView
					workspaceId={access.workspace.id}
					clients={projectClients.map((c) => ({ id: c.id, name: c.name }))}
					projects={projectRows.map((p, i) => ({
						...p,
						startDate: p.startDate,
						dueDate: p.dueDate,
						tasks: projectTasks[i],
					}))}
				/>
			) : clientRecords && clientSettings ? (
				<ClientRecordsView
					workspaceId={access.workspace.id}
					records={clientRecords.map((record) => ({
						id: record.id,
						name: record.name,
						email: record.email,
						phone: record.phone,
						company: record.company,
						notes: record.notes,
						createdAt: record.createdAt.toISOString(),
					}))}
					labelSingular={clientSettings.recordLabelSingular}
					labelPlural={clientSettings.recordLabelPlural}
					fields={clientSettings.fields}
				/>
			) : invoiceDetails && invoiceClients && invoicingSettings ? (
				<InvoicesView
					workspaceId={access.workspace.id}
					clients={invoiceClients.map((client) => ({
						id: client.id,
						name: client.name,
						company: client.company,
					}))}
					invoices={invoiceDetails.flatMap((invoice) => {
						if (!invoice) return [];
						const overdue =
							invoice.status === "sent" &&
							invoice.dueAt !== null &&
							invoice.dueAt.getTime() < today.getTime();
						return [
							{
								id: invoice.id,
								number: invoice.number,
								status: invoice.status,
								displayStatus: overdue
									? ("overdue" as const)
									: invoice.status === "sent"
										? ("issued" as const)
										: invoice.status,
								clientId: invoice.clientId,
								clientName: invoice.clientName,
								clientEmail: invoice.clientEmail,
								clientCompany: invoice.clientCompany,
								currency: invoice.currency,
								subtotalCents: invoice.subtotalCents,
								taxCents: invoice.taxCents,
								totalCents: invoice.totalCents,
								notes: invoice.notes,
								dueDate: invoice.dueAt?.toISOString().slice(0, 10) ?? null,
								issuedAt: invoice.issuedAt?.toISOString() ?? null,
								paidAt: invoice.paidAt?.toISOString() ?? null,
								createdAt: invoice.createdAt.toISOString(),
								lineItems: invoice.lineItems.map((line) => ({
									id: line.id,
									description: line.description,
									quantity: line.quantity,
									unitPriceCents: line.unitPriceCents,
									position: line.position,
									sourceModule: line.sourceModule,
								})),
							},
						];
					})}
					defaultCurrency={invoicingSettings.defaultCurrency}
					defaultDueDate={defaultDueDate}
				/>
			) : paymentDetails &&
				paymentInvoices &&
				paymentClients &&
				paymentsSettings ? (
				<PaymentsView
					workspaceId={access.workspace.id}
					defaultCurrency={paymentsSettings.defaultCurrency}
					clients={paymentClients.map((client) => ({
						id: client.id,
						name: client.name,
						company: client.company,
					}))}
					invoices={paymentInvoices
						.filter(
							(invoice) =>
								invoice.status === "sent" || invoice.status === "paid",
						)
						.map((invoice) => {
							const related = paymentDetails.flatMap((payment) =>
								payment?.invoiceId === invoice.id ? [payment] : [],
							);
							const collected = related
								.filter((payment) =>
									["succeeded", "refunded"].includes(payment.status),
								)
								.reduce((total, payment) => total + payment.amountCents, 0);
							const refunded = related.reduce(
								(total, payment) =>
									total +
									payment.refunds.reduce(
										(sum, refund) => sum + refund.amountCents,
										0,
									),
								0,
							);
							return {
								id: invoice.id,
								number: invoice.number,
								clientId: invoice.clientId,
								clientName: invoice.clientName,
								currency: invoice.currency,
								totalCents: invoice.totalCents,
								netPaidCents: collected - refunded,
							};
						})
						.filter((invoice) => invoice.netPaidCents < invoice.totalCents)}
					payments={paymentDetails.flatMap((payment) => {
						if (!payment) return [];
						const invoice = paymentInvoices.find(
							(item) => item.id === payment.invoiceId,
						);
						return [
							{
								id: payment.id,
								invoiceId: payment.invoiceId,
								invoiceNumber: invoice?.number ?? null,
								clientName: payment.clientName,
								clientCompany: payment.clientCompany,
								amountCents: payment.amountCents,
								refundedCents: payment.refunds.reduce(
									(sum, refund) => sum + refund.amountCents,
									0,
								),
								currency: payment.currency,
								status: payment.status,
								provider: payment.provider,
								paymentMethod: payment.paymentMethod,
								reference: payment.reference,
								notes: payment.notes,
								createdAt: payment.createdAt.toISOString(),
								refunds: payment.refunds.map((refund) => ({
									id: refund.id,
									amountCents: refund.amountCents,
									reason: refund.reason,
									createdAt: refund.createdAt.toISOString(),
								})),
							},
						];
					})}
				/>
			) : fulfillmentRows &&
				fulfillmentInvoices &&
				fulfillmentClients &&
				fulfillmentSettings ? (
				<FulfillmentsView
					workspaceId={access.workspace.id}
					defaultKind={fulfillmentSettings.defaultKind}
					completionLabel={fulfillmentSettings.completionLabel}
					clients={fulfillmentClients.map((client) => ({
						id: client.id,
						name: client.name,
						company: client.company,
					}))}
					invoices={fulfillmentInvoices
						.filter(
							(invoice) =>
								invoice.status === "paid" &&
								!fulfillmentRows.some(
									(item) =>
										item.sourceModule === "invoicing" &&
										item.sourceRecordId === invoice.id,
								),
						)
						.map((invoice) => ({
							id: invoice.id,
							number: invoice.number,
							clientId: invoice.clientId,
							clientName: invoice.clientName,
						}))}
					fulfillments={fulfillmentRows.map((item) => {
						const overdue =
							(item.status === "pending" || item.status === "in_progress") &&
							item.dueAt !== null &&
							item.dueAt.getTime() < today.getTime();
						return {
							id: item.id,
							title: item.title,
							kind: item.kind,
							status: item.status,
							displayStatus: overdue ? ("overdue" as const) : item.status,
							clientName: item.clientName,
							clientCompany: item.clientCompany,
							invoiceNumber: item.invoiceNumber,
							instructions: item.instructions,
							dueDate: item.dueAt?.toISOString().slice(0, 10) ?? null,
							fulfilledAt: item.fulfilledAt?.toISOString() ?? null,
							createdAt: item.createdAt.toISOString(),
						};
					})}
				/>
			) : catalogRows && catalogVariants && catalogSettings ? (
				<CatalogView
					workspaceId={access.workspace.id}
					defaultCurrency={catalogSettings.defaultCurrency}
					productLabel={catalogSettings.productLabelPlural}
					serviceLabel={catalogSettings.serviceLabelPlural}
					items={catalogRows.map((item, index) => ({
						id: item.id,
						name: item.name,
						description: item.description,
						type: item.type,
						status: item.status,
						sku: item.sku,
						pricingModel: item.pricingModel,
						priceCents: item.priceCents,
						currency: item.currency,
						unitLabel: item.unitLabel,
						variants:
							catalogVariants[index]?.map((variant) => ({
								id: variant.id,
								options: variant.options,
								status: variant.status,
								sku: variant.sku,
								priceCentsOverride: variant.priceCentsOverride,
							})) ?? [],
					}))}
				/>
			) : orderDetails &&
				orderClients &&
				orderCatalog &&
				orderCatalogVariants &&
				orderSettings ? (
				<OrdersView
					workspaceId={access.workspace.id}
					defaultCurrency={orderSettings.defaultCurrency}
					clients={orderClients.map((client) => ({
						id: client.id,
						name: client.name,
						company: client.company,
					}))}
					catalog={orderCatalog.flatMap((item, index) => {
						const base = {
							value: `${item.id}::`,
							label: item.name,
							priceCents: item.priceCents,
							currency: item.currency,
							type: item.type,
							sku: item.sku,
						};
						const variants = (orderCatalogVariants[index] ?? [])
							.filter((variant) => variant.status === "active")
							.map((variant) => ({
								value: `${item.id}::${variant.id}`,
								label: `${item.name} — ${variant.options
									.map((option) => `${option.name}: ${option.value}`)
									.join(" / ")}`,
								priceCents: variant.priceCentsOverride ?? item.priceCents,
								currency: item.currency,
								type: item.type,
								sku: variant.sku ?? item.sku,
							}));
						return [base, ...variants];
					})}
					orders={orderDetails.flatMap((order) =>
						order
							? [
									{
										id: order.id,
										number: order.number,
										status: order.status,
										clientId: order.clientId,
										clientName: order.clientName,
										clientEmail: order.clientEmail,
										currency: order.currency,
										totalCents: order.totalCents,
										notes: order.notes,
										fulfillmentId: order.fulfillmentId,
										createdAt: order.createdAt.toISOString(),
										lines: order.lines.map((line) => ({
											id: line.id,
											catalogItemId: line.catalogItemId,
											catalogItemVariantId: line.catalogItemVariantId,
											name: line.name,
											type: line.type,
											sku: line.sku,
											quantity: line.quantity,
											unitPriceCents: line.unitPriceCents,
											lineTotalCents: line.lineTotalCents,
											variantOptions: line.variantOptions,
										})),
									},
								]
							: [],
					)}
				/>
			) : inventoryRows &&
				inventoryMovements &&
				inventoryCatalog &&
				inventoryVariants &&
				inventorySettings ? (
				<InventoryView
					workspaceId={access.workspace.id}
					defaultThreshold={inventorySettings.defaultLowStockThreshold}
					targets={inventoryCatalog.flatMap((item, index) => {
						if (item.status !== "active") return [];
						const trackedBase = inventoryRows.some(
							(row) =>
								row.catalogItemId === item.id &&
								row.catalogItemVariantId === null,
						);
						const base = trackedBase
							? []
							: [
									{
										value: `${item.id}::`,
										label: item.name,
										sku: item.sku,
									},
								];
						const variants = (inventoryVariants[index] ?? [])
							.filter(
								(variant) =>
									variant.status === "active" &&
									!inventoryRows.some(
										(row) => row.catalogItemVariantId === variant.id,
									),
							)
							.map((variant) => ({
								value: `${item.id}::${variant.id}`,
								label: `${item.name} — ${variant.options
									.map((option) => `${option.name}: ${option.value}`)
									.join(" / ")}`,
								sku: variant.sku ?? item.sku,
							}));
						return [...base, ...variants];
					})}
					items={inventoryRows.map((row, index) => {
						const item = inventoryCatalog.find(
							(catalogItem) => catalogItem.id === row.catalogItemId,
						);
						const variant = inventoryVariants
							.flat()
							.find(
								(catalogVariant) =>
									catalogVariant.id === row.catalogItemVariantId,
							);
						return {
							id: row.id,
							catalogItemId: row.catalogItemId,
							catalogItemVariantId: row.catalogItemVariantId,
							label: variant
								? `${item?.name ?? "Catalog item"} — ${variant.options
										.map((option) => `${option.name}: ${option.value}`)
										.join(" / ")}`
								: (item?.name ?? "Archived catalog target"),
							sku: variant?.sku ?? item?.sku ?? null,
							status: row.status,
							onHand: row.onHand,
							reserved: row.reserved,
							available: row.onHand - row.reserved,
							lowStockThreshold: row.lowStockThreshold,
							movements: (inventoryMovements[index] ?? []).map((movement) => ({
								id: movement.id,
								kind: movement.kind,
								quantity: movement.quantity,
								onHandDelta: movement.onHandDelta,
								reservedDelta: movement.reservedDelta,
								resultingOnHand: movement.resultingOnHand,
								resultingReserved: movement.resultingReserved,
								note: movement.note,
								createdAt: movement.createdAt.toISOString(),
							})),
						};
					})}
				/>
			) : bookingRows && bookingClients && bookingsSettings ? (
				<BookingsView
					workspaceId={access.workspace.id}
					defaultTimeZone={bookingsSettings.defaultTimeZone}
					defaultDuration={bookingsSettings.defaultDurationMinutes}
					clients={bookingClients.map((client) => ({
						id: client.id,
						name: client.name,
						company: client.company,
					}))}
					bookings={bookingRows.map((booking) => ({
						id: booking.id,
						title: booking.title,
						clientName: booking.clientName,
						clientCompany: null,
						status: booking.status,
						scheduleKey: booking.scheduleKey,
						startsAt: booking.startsAt.toISOString(),
						endsAt: booking.endsAt.toISOString(),
						timeZone: booking.timeZone,
						locationKind: booking.locationKind,
						location: booking.location,
						notes: booking.notes,
					}))}
				/>
			) : shipmentDetails && shippingOrders && shippingSettings ? (
				<ShippingView
					workspaceId={access.workspace.id}
					defaultCountry={shippingSettings.defaultOriginCountry}
					defaultCarrier={shippingSettings.defaultCarrier}
					shippableLines={shippingOrders.flatMap((order) => {
						if (
							!order ||
							(order.status !== "confirmed" && order.status !== "processing")
						)
							return [];
						return order.lines.flatMap((line) => {
							if (line.type !== "physical" && line.type !== "rental") return [];
							const allocated = shipmentDetails.reduce((total, shipment) => {
								if (!shipment || shipment.status === "cancelled") return total;
								return (
									total +
									shipment.lines
										.filter((item) => item.orderLineItemId === line.id)
										.reduce((sum, item) => sum + item.quantity, 0)
								);
							}, 0);
							const remaining = line.quantity - allocated;
							return remaining > 0
								? [
										{
											orderId: order.id,
											orderNumber: order.number,
											lineId: line.id,
											label: line.sku
												? `${line.name} (${line.sku})`
												: line.name,
											remaining,
											recipientName: order.clientName,
											recipientEmail: order.clientEmail,
										},
									]
								: [];
						});
					})}
					shipments={shipmentDetails.flatMap((shipment) => {
						if (!shipment) return [];
						const order = shippingOrders.find(
							(candidate) => candidate?.id === shipment.orderId,
						);
						return [
							{
								id: shipment.id,
								orderNumber: order?.number ?? "Archived order",
								status: shipment.status,
								destination: shipment.destination,
								carrier: shipment.carrier,
								serviceLevel: shipment.serviceLevel,
								trackingNumber: shipment.trackingNumber,
								trackingUrl: shipment.trackingUrl,
								createdAt: shipment.createdAt.toISOString(),
								lines: shipment.lines.map((shipmentLine) => ({
									label:
										order?.lines.find(
											(line) => line.id === shipmentLine.orderLineItemId,
										)?.name ?? "Archived order line",
									quantity: shipmentLine.quantity,
								})),
								parcels: shipment.parcels.map((parcel) => ({
									weightGrams: parcel.weightGrams,
								})),
							},
						];
					})}
				/>
			) : (
				<section className="mt-8 rounded-xl border border-dashed p-8">
					<h2 className="font-medium">Module connected</h2>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm">
						QuickDash resolved this module from the workspace registry and
						enforced workspace ownership before rendering it. Its operational
						interface is the next layer to build.
					</p>
				</section>
			)}
		</main>
	);
}
