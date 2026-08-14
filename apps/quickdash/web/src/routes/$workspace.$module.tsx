import type { QuickCategoryNode } from "@quickengine/quick/browser";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookingsView } from "../components/bookings-view";
import { CatalogView } from "../components/catalog-view";
import { ClientRecordsView } from "../components/client-records-view";
import { type ContentEntry, ContentView } from "../components/content-view";
import {
	ContractsView,
	type ContractViewModel,
} from "../components/contracts-view";
import { FilesView } from "../components/files-view";
import {
	FulfillmentsView,
	type FulfillmentViewModel,
} from "../components/fulfillments-view";
import { InventoryView } from "../components/inventory-view";
import {
	InvoicesView,
	type InvoiceViewModel,
} from "../components/invoices-view";
import { type OrderLineViewModel, OrdersView } from "../components/orders-view";
import {
	PaymentsView,
	type PaymentViewModel,
} from "../components/payments-view";
import { ProjectsView } from "../components/projects-view";
import { QuotesView, type QuoteViewModel } from "../components/quotes-view";
import {
	REPORT_GRANULARITIES,
	REPORT_RANGE_PRESETS,
	type ReportGranularity,
	ReportingView,
	type WorkspaceReport,
} from "../components/reporting-view";
import {
	normalizeResourceListState,
	type ResourceListState,
} from "../components/resource-list";
import {
	type ShipmentViewModel,
	ShippingView,
} from "../components/shipping-view";
import { TimeTrackingView } from "../components/time-tracking-view";
import { workspaceApi } from "../lib/api";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * The category tree, flattened depth-first.
 *
 * The API returns nesting because a storefront renders it as navigation. An
 * operator picking categories for a product wants one list, in the order they
 * would read it — a parent immediately followed by its children.
 */
function flattenCategoryTree(nodes: QuickCategoryNode[]): QuickCategoryNode[] {
	return nodes.flatMap((node) => [
		node,
		...flattenCategoryTree(node.children ?? []),
	]);
}

function ModulePage() {
	const { workspace, module } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const listState = normalizeResourceListState(search);
	const onListStateChange = (patch: Partial<ResourceListState>) => {
		void navigate({
			search: (previous) => ({ ...previous, ...patch }),
			replace: true,
		});
	};
	const reportDays = (REPORT_RANGE_PRESETS as readonly number[]).includes(
		search.days ?? 30,
	)
		? (search.days ?? 30)
		: 30;
	const reportGranularity = (
		REPORT_GRANULARITIES as readonly string[]
	).includes(search.granularity ?? "day")
		? (search.granularity as ReportGranularity)
		: "day";
	const context = useQuery(quickDashQueries.context(workspace));
	const clients = useQuery({
		queryKey: ["quickdash", workspace, "clients"],
		queryFn: async () => (await workspaceApi(workspace).clients.list()).data,
		enabled: module === "client-records",
	});
	// Drafts included: this is the only route that returns unpublished slots, and
	// an operator editing their own words has to see what they have not said yet.
	const content = useQuery({
		queryKey: ["quickdash", workspace, "content"],
		queryFn: async () =>
			(
				await workspaceApi(workspace).request<{ items: ContentEntry[] }>(
					"/content/manage/all",
				)
			).data,
		enabled: module === "content",
	});
	const catalog = useQuery({
		queryKey: ["quickdash", workspace, "catalog"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const items = (await api.catalog.list({ limit: 100 })).data.items;
			const [variants, categoryTree] = await Promise.all([
				Promise.all(
					items.map(
						async (item) => (await api.catalog.listVariants(item.id)).data,
					),
				),
				// `visibleOnly: false` — an operator managing categories needs to see
				// the hidden ones, which is exactly what a storefront must not.
				api.catalog.listCategories({ visibleOnly: false }),
			]);
			// Which categories each item is in. The tree carries membership by
			// category, and the editor needs it by item.
			const membership = await Promise.all(
				flattenCategoryTree(categoryTree.data.items).map(async (category) => ({
					categoryId: category.id,
					itemIds: (await api.site.listCategoryItems(category.slug)).data
						.itemIds,
				})),
			);
			return {
				items,
				variants,
				categories: flattenCategoryTree(categoryTree.data.items),
				membership,
			};
		},
		enabled: module === "products-services",
	});
	const inventory = useQuery({
		queryKey: ["quickdash", workspace, "inventory"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [items, catalogItems] = await Promise.all([
				api.inventory.list({ limit: 100 }),
				api.catalog.list({ limit: 100 }),
			]);
			const [movements, variants] = await Promise.all([
				Promise.all(
					items.data.items.map(
						async (item) =>
							(await api.inventory.listAdjustments(item.id, { limit: 100 }))
								.data,
					),
				),
				Promise.all(
					catalogItems.data.items.map(
						async (item) => (await api.catalog.listVariants(item.id)).data,
					),
				),
			]);
			return {
				items: items.data.items,
				catalog: catalogItems.data.items,
				movements,
				variants,
			};
		},
		enabled: module === "inventory",
	});
	const orders = useQuery({
		queryKey: ["quickdash", workspace, "orders"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [orderPage, clients, catalog] = await Promise.all([
				api.orders.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
				api.catalog.list({ limit: 100, status: "active" }),
			]);
			const [details, variants] = await Promise.all([
				Promise.all(
					orderPage.data.items.map(
						async (order) => (await api.orders.get(order.id)).data,
					),
				),
				Promise.all(
					catalog.data.items.map(
						async (item) => (await api.catalog.listVariants(item.id)).data,
					),
				),
			]);
			return {
				orders: details,
				clients: clients.data.items,
				catalog: catalog.data.items,
				variants,
			};
		},
		enabled: module === "orders",
	});
	const quotes = useQuery({
		queryKey: ["quickdash", workspace, "quotes"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [page, clients] = await Promise.all([
				api.quotes.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
			]);
			const details = await Promise.all(
				page.data.items.map(
					async (quote) => (await api.quotes.get(quote.id)).data,
				),
			);
			return { quotes: details, clients: clients.data.items };
		},
		enabled: module === "quotes-estimates",
	});
	const invoices = useQuery({
		queryKey: ["quickdash", workspace, "invoices"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [page, clients] = await Promise.all([
				api.invoices.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
			]);
			const details = await Promise.all(
				page.data.items.map(
					async (invoice) => (await api.invoices.get(invoice.id)).data,
				),
			);
			return { invoices: details, clients: clients.data.items };
		},
		enabled: module === "invoicing",
	});
	const payments = useQuery({
		queryKey: ["quickdash", workspace, "payments"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [page, invoicePage, clients] = await Promise.all([
				api.payments.list({ limit: 100 }),
				api.invoices.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
			]);
			const details = await Promise.all(
				page.data.items.map(
					async (payment) => (await api.payments.get(payment.id)).data,
				),
			);
			return {
				payments: details,
				invoices: invoicePage.data.items,
				clients: clients.data.items,
			};
		},
		enabled: module === "payments",
	});
	const contracts = useQuery({
		queryKey: ["quickdash", workspace, "contracts"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [page, clients, documents] = await Promise.all([
				api.contracts.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
				api.files.list({ limit: 100 }),
			]);
			const [details, fileDetails] = await Promise.all([
				Promise.all(
					page.data.items.map(
						async (contract) => (await api.contracts.get(contract.id)).data,
					),
				),
				Promise.all(
					documents.data.items.map(
						async (document) => (await api.files.get(document.id)).data,
					),
				),
			]);
			return { contracts: details, clients: clients.data.items, fileDetails };
		},
		enabled: module === "contracts-esign",
	});
	const bookings = useQuery({
		queryKey: ["quickdash", workspace, "bookings"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [page, clients, catalog] = await Promise.all([
				api.bookings.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
				api.catalog.list({ limit: 100, status: "active" }),
			]);
			return {
				bookings: page.data.items,
				clients: clients.data.items,
				catalog: catalog.data.items,
			};
		},
		enabled: module === "bookings",
	});
	const fulfillments = useQuery({
		queryKey: ["quickdash", workspace, "fulfillments"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [fulfillmentPage, invoicePage, clients] = await Promise.all([
				api.fulfillments.list({ limit: 100 }),
				api.invoices.list({ limit: 100 }),
				api.clients.list({ limit: 100 }),
			]);
			return {
				fulfillments: fulfillmentPage.data.items,
				invoices: invoicePage.data.items,
				clients: clients.data.items,
			};
		},
		enabled: module === "fulfillment",
	});
	const shipping = useQuery({
		queryKey: ["quickdash", workspace, "shipping"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [shipmentPage, orderPage] = await Promise.all([
				api.shipments.list({ limit: 100 }),
				api.orders.list({ limit: 100 }),
			]);
			const [shipments, orders] = await Promise.all([
				Promise.all(
					shipmentPage.data.items.map(
						async (shipment) => (await api.shipments.get(shipment.id)).data,
					),
				),
				Promise.all(
					orderPage.data.items.map(
						async (order) => (await api.orders.get(order.id)).data,
					),
				),
			]);
			return { shipments, orders };
		},
		enabled: module === "shipping",
	});
	const projects = useQuery({
		queryKey: ["quickdash", workspace, "projects"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [page, clients] = await Promise.all([
				api.projects.list({ limit: 100, includeArchived: true }),
				api.clients.list({ limit: 100 }),
			]);
			const tasks = await Promise.all(
				page.data.items.map(
					async (project) =>
						(
							await api.projects.tasks.list({
								projectId: project.id,
								limit: 100,
							})
						).data.items,
				),
			);
			return { projects: page.data.items, tasks, clients: clients.data.items };
		},
		enabled: module === "projects-tasks",
	});
	const time = useQuery({
		queryKey: ["quickdash", workspace, "time"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [entries, projectPage] = await Promise.all([
				api.time.list({ limit: 100 }),
				api.projects.list({ limit: 100 }),
			]);
			const tasks = await Promise.all(
				projectPage.data.items.map(
					async (project) =>
						(
							await api.projects.tasks.list({
								projectId: project.id,
								limit: 100,
							})
						).data.items,
				),
			);
			return {
				entries: entries.data.items,
				projects: projectPage.data.items,
				tasks,
			};
		},
		enabled: module === "time-tracking",
	});
	const files = useQuery({
		queryKey: ["quickdash", workspace, "files"],
		queryFn: async () => {
			const api = workspaceApi(workspace);
			const [folders, active, archived, trashed] = await Promise.all([
				api.files.listFolders({ limit: 100 }),
				api.files.list({ limit: 100, status: "active" }),
				api.files.list({ limit: 100, status: "archived" }),
				api.files.list({ limit: 100, status: "trashed" }),
			]);
			const documents = [
				...active.data.items,
				...archived.data.items,
				...trashed.data.items,
			];
			const details = await Promise.all(
				documents.map(
					async (document) => (await api.files.get(document.id)).data,
				),
			);
			return { folders: folders.data.items, documents: details };
		},
		enabled: module === "files",
	});
	const reporting = useQuery({
		queryKey: [
			"quickdash",
			workspace,
			"reporting",
			reportDays,
			reportGranularity,
			context.data?.modules,
		],
		queryFn: async () => {
			const config = context.data?.modules.find(
				(candidate) => candidate.id === "reporting-analytics",
			)?.settings as { defaultTimeZone?: string } | undefined;
			const timeZone = config?.defaultTimeZone ?? "UTC";
			const now = new Date();
			const report = (
				await workspaceApi(workspace).reports.workspace({
					from: new Date(now.getTime() - reportDays * 86_400_000),
					to: now,
					timeZone,
					granularity: reportGranularity,
				})
			).data;
			return { report, timeZone };
		},
		enabled: module === "reporting-analytics" && context.isSuccess,
	});
	if (
		context.isPending ||
		(module === "client-records" && clients.isPending) ||
		(module === "products-services" && catalog.isPending) ||
		(module === "inventory" && inventory.isPending) ||
		(module === "orders" && orders.isPending) ||
		(module === "quotes-estimates" && quotes.isPending) ||
		(module === "invoicing" && invoices.isPending) ||
		(module === "payments" && payments.isPending) ||
		(module === "contracts-esign" && contracts.isPending) ||
		(module === "bookings" && bookings.isPending) ||
		(module === "fulfillment" && fulfillments.isPending) ||
		(module === "shipping" && shipping.isPending) ||
		(module === "projects-tasks" && projects.isPending) ||
		(module === "time-tracking" && time.isPending) ||
		(module === "files" && files.isPending) ||
		(module === "reporting-analytics" && reporting.isPending) ||
		(module === "content" && content.isPending)
	) {
		return <main className="p-6">Loading module…</main>;
	}
	if (context.isError) throw context.error;
	if (clients.isError) throw clients.error;
	if (content.isError) throw content.error;
	if (catalog.isError) throw catalog.error;
	if (inventory.isError) throw inventory.error;
	if (orders.isError) throw orders.error;
	if (quotes.isError) throw quotes.error;
	if (invoices.isError) throw invoices.error;
	if (payments.isError) throw payments.error;
	if (contracts.isError) throw contracts.error;
	if (bookings.isError) throw bookings.error;
	if (fulfillments.isError) throw fulfillments.error;
	if (shipping.isError) throw shipping.error;
	if (projects.isError) throw projects.error;
	if (time.isError) throw time.error;
	if (files.isError) throw files.error;
	if (reporting.isError) throw reporting.error;
	if (module === "content" && content.data) {
		return <ContentView workspaceId={workspace} entries={content.data.items} />;
	}
	if (module === "client-records" && clients.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| {
					fields?: { phone?: boolean; company?: boolean; notes?: boolean };
					recordLabelSingular?: string;
					recordLabelPlural?: string;
			  }
			| undefined;
		return (
			<ClientRecordsView
				workspaceId={workspace}
				fields={{
					phone: settings?.fields?.phone ?? true,
					company: settings?.fields?.company ?? true,
					notes: settings?.fields?.notes ?? true,
				}}
				labelSingular={settings?.recordLabelSingular ?? "Client"}
				labelPlural={settings?.recordLabelPlural ?? "Clients"}
				records={clients.data.items.map((record) => ({
					...record,
					createdAt: String(record.createdAt),
				}))}
			/>
		);
	}
	if (module === "products-services" && catalog.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| {
					defaultCurrency?: string;
					productLabelPlural?: string;
					serviceLabelPlural?: string;
			  }
			| undefined;
		return (
			<CatalogView
				workspaceId={workspace}
				categories={catalog.data.categories}
				membership={catalog.data.membership}
				listState={listState}
				onListStateChange={onListStateChange}
				defaultCurrency={settings?.defaultCurrency ?? "USD"}
				productLabel={settings?.productLabelPlural ?? "Products"}
				serviceLabel={settings?.serviceLabelPlural ?? "Services"}
				items={catalog.data.items.map((item, index) => ({
					...item,
					variants: catalog.data.variants[index] ?? [],
				}))}
			/>
		);
	}
	if (module === "inventory" && inventory.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as { defaultLowStockThreshold?: number } | undefined;
		const variants = inventory.data.variants.flat();
		return (
			<InventoryView
				workspaceId={workspace}
				listState={listState}
				onListStateChange={onListStateChange}
				defaultThreshold={settings?.defaultLowStockThreshold ?? 5}
				targets={inventory.data.catalog.flatMap((item, index) => {
					if (item.status !== "active") return [];
					const baseTracked = inventory.data.items.some(
						(row) =>
							row.catalogItemId === item.id &&
							row.catalogItemVariantId === null,
					);
					const base = baseTracked
						? []
						: [{ value: `${item.id}::`, label: item.name, sku: item.sku }];
					const itemVariants = (inventory.data.variants[index] ?? [])
						.filter(
							(variant) =>
								variant.status === "active" &&
								!inventory.data.items.some(
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
					return [...base, ...itemVariants];
				})}
				items={inventory.data.items.map((row, index) => {
					const item = inventory.data.catalog.find(
						(candidate) => candidate.id === row.catalogItemId,
					);
					const variant = variants.find(
						(candidate) => candidate.id === row.catalogItemVariantId,
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
						movements: (inventory.data.movements[index]?.items ?? []).map(
							(movement) => ({
								...movement,
								createdAt: String(movement.createdAt),
							}),
						),
					};
				})}
			/>
		);
	}
	if (module === "orders" && orders.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as { defaultCurrency?: string } | undefined;
		const defaultCurrency = settings?.defaultCurrency ?? "USD";
		return (
			<OrdersView
				workspaceId={workspace}
				listState={listState}
				onListStateChange={onListStateChange}
				defaultCurrency={defaultCurrency}
				clients={orders.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				catalog={orders.data.catalog.flatMap((item, index) => {
					if (item.currency !== defaultCurrency) return [];
					const base = {
						value: `${item.id}::`,
						label: item.name,
						priceCents: item.priceCents,
						currency: item.currency,
						type: item.type,
						sku: item.sku,
					};
					const variants = (orders.data.variants[index] ?? [])
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
				orders={orders.data.orders.map((order) => {
					const lines: OrderLineViewModel[] = (order.lineItems ?? []).map(
						(line) => ({
							id: line.id,
							catalogItemId:
								typeof line.catalogItemId === "string"
									? line.catalogItemId
									: null,
							catalogItemVariantId:
								typeof line.catalogItemVariantId === "string"
									? line.catalogItemVariantId
									: null,
							name: line.name,
							type: line.type as OrderLineViewModel["type"],
							sku: typeof line.sku === "string" ? line.sku : null,
							quantity: line.quantity,
							unitPriceCents: line.unitPriceCents,
							lineTotalCents: line.lineTotalCents,
							variantOptions: Array.isArray(line.variantOptions)
								? (line.variantOptions as Array<{
										name: string;
										value: string;
									}>)
								: [],
						}),
					);
					return {
						id: order.id,
						number: order.number,
						status: order.status,
						clientId: order.clientId,
						clientName: order.clientName,
						clientEmail: order.clientEmail,
						currency: order.currency,
						subtotalCents: order.subtotalCents,
						discountCents: Number(order.discountCents ?? 0),
						discountCode:
							typeof order.discountCode === "string"
								? order.discountCode
								: null,
						shippingCents: Number(order.shippingCents ?? 0),
						shippingRateName:
							typeof order.shippingRateName === "string"
								? order.shippingRateName
								: null,
						taxCents: Number(order.taxCents ?? 0),
						totalCents: order.totalCents,
						destination:
							typeof order.shipToName === "string" &&
							typeof order.shipToLine1 === "string" &&
							typeof order.shipToCity === "string" &&
							typeof order.shipToCountryCode === "string"
								? {
										name: order.shipToName,
										line1: order.shipToLine1,
										line2:
											typeof order.shipToLine2 === "string"
												? order.shipToLine2
												: null,
										city: order.shipToCity,
										region:
											typeof order.shipToRegion === "string"
												? order.shipToRegion
												: null,
										postalCode:
											typeof order.shipToPostalCode === "string"
												? order.shipToPostalCode
												: null,
										countryCode: order.shipToCountryCode,
									}
								: null,
						payment: order.payment
							? {
									provider: order.payment.provider,
									paymentMethod: order.payment.paymentMethod,
									reference: order.payment.reference,
									status: order.payment.status,
									amountCents: order.payment.amountCents,
									refundedCents: order.payment.refunds.reduce(
										(sum, refund) => sum + refund.amountCents,
										0,
									),
								}
							: null,
						shipments: order.shipments,
						notes: order.notes,
						fulfillmentId: order.fulfillmentId,
						createdAt: String(order.createdAt),
						lines,
					};
				})}
			/>
		);
	}
	if (module === "quotes-estimates" && quotes.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| { defaultCurrency?: string; defaultValidityDays?: number }
			| undefined;
		const today = new Date();
		return (
			<QuotesView
				workspaceId={workspace}
				defaultCurrency={settings?.defaultCurrency ?? "USD"}
				today={today.toISOString().slice(0, 10)}
				defaultValidUntil={new Date(
					today.getTime() + (settings?.defaultValidityDays ?? 30) * 86_400_000,
				)
					.toISOString()
					.slice(0, 10)}
				clients={quotes.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				quotes={
					quotes.data.quotes.map((quote) => ({
						...quote,
						clientId: quote.clientId ?? null,
						clientName:
							typeof quote.clientName === "string" ? quote.clientName : null,
						clientEmail:
							typeof quote.clientEmail === "string" ? quote.clientEmail : null,
						clientCompany:
							typeof quote.clientCompany === "string"
								? quote.clientCompany
								: null,
						terms: typeof quote.terms === "string" ? quote.terms : null,
						acceptedByName:
							typeof quote.acceptedByName === "string"
								? quote.acceptedByName
								: null,
						acceptedByEmail:
							typeof quote.acceptedByEmail === "string"
								? quote.acceptedByEmail
								: null,
						acceptanceNote:
							typeof quote.acceptanceNote === "string"
								? quote.acceptanceNote
								: null,
						convertedInvoiceId:
							typeof quote.convertedInvoiceId === "string"
								? quote.convertedInvoiceId
								: null,
						convertedOrderId:
							typeof quote.convertedOrderId === "string"
								? quote.convertedOrderId
								: null,
						revision: typeof quote.revision === "number" ? quote.revision : 1,
						createdAt: String(quote.createdAt),
						lines: (quote.lines ?? []).map((line) => ({
							id: line.id,
							name: line.name,
							description:
								typeof line.description === "string" ? line.description : null,
							quantity: String(line.quantity),
							unitPriceCents: line.unitPriceCents,
							lineTotalCents: line.lineTotalCents,
							position: line.position,
						})),
					})) as QuoteViewModel[]
				}
			/>
		);
	}
	if (module === "invoicing" && invoices.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| { defaultCurrency?: string; defaultDueInDays?: number }
			| undefined;
		const today = new Date();
		return (
			<InvoicesView
				workspaceId={workspace}
				defaultCurrency={settings?.defaultCurrency ?? "USD"}
				defaultDueDate={new Date(
					today.getTime() + (settings?.defaultDueInDays ?? 30) * 86_400_000,
				)
					.toISOString()
					.slice(0, 10)}
				clients={invoices.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				invoices={
					invoices.data.invoices.map((invoice) => {
						const overdue =
							invoice.status === "sent" &&
							Boolean(invoice.dueAt) &&
							new Date(String(invoice.dueAt)).getTime() < today.getTime();
						return {
							...invoice,
							displayStatus: overdue
								? "overdue"
								: invoice.status === "sent"
									? "issued"
									: invoice.status,
							clientEmail:
								typeof invoice.clientEmail === "string"
									? invoice.clientEmail
									: null,
							clientCompany:
								typeof invoice.clientCompany === "string"
									? invoice.clientCompany
									: null,
							dueDate: invoice.dueAt
								? String(invoice.dueAt).slice(0, 10)
								: null,
							issuedAt:
								typeof invoice.issuedAt === "string" ? invoice.issuedAt : null,
							paidAt:
								typeof invoice.paidAt === "string" ? invoice.paidAt : null,
							createdAt: String(invoice.createdAt),
							lineItems: (invoice.lineItems ?? []).map((line) => ({
								...line,
								sourceModule:
									typeof line.sourceModule === "string"
										? line.sourceModule
										: null,
							})),
						};
					}) as InvoiceViewModel[]
				}
			/>
		);
	}
	if (module === "payments" && payments.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as { defaultCurrency?: string } | undefined;
		return (
			<PaymentsView
				workspaceId={workspace}
				defaultCurrency={settings?.defaultCurrency ?? "USD"}
				clients={payments.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				invoices={payments.data.invoices
					.filter(
						(invoice) => invoice.status === "sent" || invoice.status === "paid",
					)
					.map((invoice) => {
						const related = payments.data.payments.filter(
							(payment) => payment.invoiceId === invoice.id,
						);
						const collected = related
							.filter((payment) =>
								["succeeded", "refunded"].includes(payment.status),
							)
							.reduce((sum, payment) => sum + payment.amountCents, 0);
						const refunded = related.reduce(
							(sum, payment) =>
								sum +
								(payment.refunds ?? []).reduce(
									(total, refund) => total + refund.amountCents,
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
				payments={
					payments.data.payments.map((payment) => ({
						...payment,
						clientId:
							typeof payment.clientId === "string" ? payment.clientId : null,
						invoiceNumber:
							payments.data.invoices.find(
								(invoice) => invoice.id === payment.invoiceId,
							)?.number ?? null,
						clientName:
							typeof payment.clientName === "string"
								? payment.clientName
								: null,
						clientCompany:
							typeof payment.clientCompany === "string"
								? payment.clientCompany
								: null,
						refundedCents: (payment.refunds ?? []).reduce(
							(sum, refund) => sum + refund.amountCents,
							0,
						),
						paymentMethod:
							typeof payment.paymentMethod === "string"
								? payment.paymentMethod
								: "other",
						reference:
							typeof payment.reference === "string" ? payment.reference : null,
						notes: typeof payment.notes === "string" ? payment.notes : null,
						createdAt: String(payment.createdAt),
						refunds: (payment.refunds ?? []).map((refund) => ({
							id: refund.id,
							amountCents: refund.amountCents,
							reason: typeof refund.reason === "string" ? refund.reason : null,
							createdAt: String(refund.createdAt ?? ""),
						})),
					})) as PaymentViewModel[]
				}
			/>
		);
	}
	if (module === "contracts-esign" && contracts.data) {
		const fileVersions = contracts.data.fileDetails.flatMap((document) =>
			(document.versions ?? [])
				.filter((version) => version.status === "available")
				.map((version) => ({
					value: version.id,
					label: `${document.title} · v${version.versionNumber}${
						version.originalName ? ` (${version.originalName})` : ""
					}`,
				})),
		);
		return (
			<ContractsView
				workspaceId={workspace}
				clients={contracts.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				fileVersions={fileVersions}
				contracts={
					contracts.data.contracts.map((contract) => ({
						...contract,
						description:
							typeof contract.description === "string"
								? contract.description
								: null,
						clientCompany:
							typeof contract.clientCompany === "string"
								? contract.clientCompany
								: null,
						fileName:
							typeof contract.fileName === "string"
								? contract.fileName
								: "Document",
						fileVersionId:
							typeof contract.fileVersionId === "string"
								? contract.fileVersionId
								: "",
						effectiveOn:
							typeof contract.effectiveOn === "string"
								? contract.effectiveOn
								: null,
						endsOn:
							typeof contract.endsOn === "string" ? contract.endsOn : null,
						signingExpiresAt: contract.expiresAt,
						revision:
							typeof contract.revision === "number" ? contract.revision : 1,
						createdAt: String(contract.createdAt),
						signers: contract.signers ?? [],
						auditEvents: Array.isArray(contract.auditEvents)
							? contract.auditEvents
							: [],
					})) as ContractViewModel[]
				}
			/>
		);
	}
	if (module === "bookings" && bookings.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| { defaultTimeZone?: string; defaultDurationMinutes?: number }
			| undefined;
		return (
			<BookingsView
				workspaceId={workspace}
				defaultTimeZone={settings?.defaultTimeZone ?? "UTC"}
				defaultDuration={settings?.defaultDurationMinutes ?? 60}
				services={bookings.data.catalog
					.filter((item) =>
						["service", "rental", "package"].includes(item.type),
					)
					.map((item) => ({
						id: item.id,
						name: item.name,
						type: item.type,
					}))}
				clients={bookings.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				bookings={bookings.data.bookings.map((booking) => ({
					...booking,
					clientId: booking.clientId,
					clientName: booking.clientName ?? "Client",
					clientCompany: null,
					catalogItemId:
						typeof booking.catalogItemId === "string"
							? booking.catalogItemId
							: null,
					catalogItemName:
						typeof booking.catalogItemId === "string"
							? (bookings.data.catalog.find(
									(item) => item.id === booking.catalogItemId,
								)?.name ?? null)
							: null,
					startsAt: String(booking.startsAt),
					endsAt: String(booking.endsAt),
					notes: typeof booking.notes === "string" ? booking.notes : null,
				}))}
			/>
		);
	}
	if (module === "fulfillment" && fulfillments.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| { defaultKind?: string; completionLabel?: string }
			| undefined;
		const now = Date.now();
		return (
			<FulfillmentsView
				workspaceId={workspace}
				defaultKind={
					(settings?.defaultKind ?? "physical") as
						| "physical"
						| "digital"
						| "service"
						| "pickup"
						| "other"
				}
				completionLabel={settings?.completionLabel ?? "Fulfilled"}
				clients={fulfillments.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
					company: client.company,
				}))}
				invoices={fulfillments.data.invoices
					.filter(
						(invoice) =>
							invoice.status === "paid" &&
							!fulfillments.data.fulfillments.some(
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
				fulfillments={
					fulfillments.data.fulfillments.map((item) => ({
						...item,
						sourceModule:
							typeof item.sourceModule === "string" ? item.sourceModule : null,
						sourceRecordId:
							typeof item.sourceRecordId === "string"
								? item.sourceRecordId
								: null,
						clientId: typeof item.clientId === "string" ? item.clientId : null,
						displayStatus:
							["pending", "in_progress"].includes(item.status) &&
							item.dueAt &&
							new Date(String(item.dueAt)).getTime() < now
								? "overdue"
								: item.status,
						clientName:
							typeof item.clientName === "string" ? item.clientName : null,
						clientCompany:
							typeof item.clientCompany === "string"
								? item.clientCompany
								: null,
						invoiceNumber:
							typeof item.invoiceNumber === "string"
								? item.invoiceNumber
								: null,
						instructions:
							typeof item.instructions === "string" ? item.instructions : null,
						dueDate: item.dueAt ? String(item.dueAt).slice(0, 10) : null,
						fulfilledAt:
							typeof item.fulfilledAt === "string" ? item.fulfilledAt : null,
						createdAt: String(item.createdAt),
					})) as FulfillmentViewModel[]
				}
			/>
		);
	}
	if (module === "shipping" && shipping.data) {
		type ShippingOrder = (typeof shipping.data.orders)[number] & {
			lines: Array<{
				id: string;
				type: string;
				name: string;
				sku: string | null;
				quantity: number;
			}>;
		};
		type ShippingDetail = (typeof shipping.data.shipments)[number] & {
			lines: Array<{ orderLineItemId: string; quantity: number }>;
			parcels: Array<{ weightGrams: number }>;
		};
		const shippingOrders = shipping.data.orders as ShippingOrder[];
		const shipmentDetails = shipping.data.shipments as ShippingDetail[];
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| {
					defaultOriginCountry?: string;
					defaultCarrier?: string | null;
			  }
			| undefined;
		return (
			<ShippingView
				workspaceId={workspace}
				defaultCountry={settings?.defaultOriginCountry ?? "US"}
				defaultCarrier={settings?.defaultCarrier ?? null}
				shippableLines={shippingOrders.flatMap((order) => {
					if (order.status !== "confirmed" && order.status !== "processing") {
						return [];
					}
					return order.lines.flatMap((line) => {
						if (line.type !== "physical" && line.type !== "rental") return [];
						const allocated = shipmentDetails.reduce((total, shipment) => {
							if (shipment.status === "cancelled") return total;
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
										label: line.sku ? `${line.name} (${line.sku})` : line.name,
										remaining,
										recipientName:
											typeof order.shipToName === "string"
												? order.shipToName
												: order.clientName,
										recipientEmail: order.clientEmail,
										destination:
											typeof order.shipToLine1 === "string" &&
											typeof order.shipToCity === "string" &&
											typeof order.shipToCountryCode === "string"
												? {
														line1: order.shipToLine1,
														line2:
															typeof order.shipToLine2 === "string"
																? order.shipToLine2
																: null,
														city: order.shipToCity,
														region:
															typeof order.shipToRegion === "string"
																? order.shipToRegion
																: null,
														postalCode:
															typeof order.shipToPostalCode === "string"
																? order.shipToPostalCode
																: null,
														countryCode: order.shipToCountryCode,
													}
												: null,
									},
								]
							: [];
					});
				})}
				shipments={
					shipmentDetails.map((shipment) => {
						const order = shippingOrders.find(
							(candidate) => candidate.id === shipment.orderId,
						);
						return {
							id: shipment.id,
							orderId: shipment.orderId,
							orderNumber: order?.number ?? "Archived order",
							status: shipment.status,
							destination: shipment.destination,
							carrier: shipment.carrier,
							serviceLevel: shipment.serviceLevel,
							trackingNumber: shipment.trackingNumber,
							trackingUrl: shipment.trackingUrl,
							createdAt: String(shipment.createdAt),
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
						};
					}) as ShipmentViewModel[]
				}
			/>
		);
	}
	if (module === "projects-tasks" && projects.data) {
		return (
			<ProjectsView
				workspaceId={workspace}
				clients={projects.data.clients.map((client) => ({
					id: client.id,
					name: client.name,
				}))}
				projects={projects.data.projects.map((project, index) => ({
					id: project.id,
					name: project.name,
					clientName:
						typeof project.clientName === "string"
							? project.clientName
							: (projects.data.clients.find(
									(client) => client.id === project.clientId,
								)?.name ?? null),
					status: project.status,
					dueDate: project.dueDate,
					archivedAt: project.archivedAt,
					tasks: (projects.data.tasks[index] ?? []).map((task) => ({
						id: task.id,
						title: task.title,
						priority: task.priority,
						status: task.status,
					})),
				}))}
			/>
		);
	}
	if (module === "time-tracking" && time.data) {
		const settings = context.data.modules.find(
			(candidate) => candidate.id === module,
		)?.settings as
			| {
					defaultBillable?: boolean;
					defaultHourlyRateCents?: number | null;
			  }
			| undefined;
		return (
			<TimeTrackingView
				workspaceId={workspace}
				defaultBillable={settings?.defaultBillable ?? false}
				defaultRateCents={settings?.defaultHourlyRateCents ?? null}
				projects={time.data.projects
					.map((project, index) => ({
						id: project.id,
						name: project.name,
						status: project.status,
						tasks: (time.data.tasks[index] ?? []).map((task) => ({
							id: task.id,
							title: task.title,
							status: task.status,
						})),
					}))
					.filter(
						(project) =>
							project.status !== "completed" && project.status !== "cancelled",
					)
					.map((project) => ({
						id: project.id,
						name: project.name,
						tasks: project.tasks
							.filter(
								(task) =>
									task.status !== "completed" && task.status !== "cancelled",
							)
							.map(({ id, title }) => ({ id, title })),
					}))}
				entries={time.data.entries.map((entry) => ({
					id: entry.id,
					projectName:
						typeof entry.projectName === "string"
							? entry.projectName
							: (time.data.projects.find(
									(project) => project.id === entry.projectId,
								)?.name ?? "Archived project"),
					taskTitle:
						typeof entry.taskTitle === "string"
							? entry.taskTitle
							: (time.data.tasks.flat().find((task) => task.id === entry.taskId)
									?.title ?? null),
					description: entry.description,
					status: entry.status,
					durationSeconds: entry.durationSeconds,
					workDate: typeof entry.workDate === "string" ? entry.workDate : null,
					billable: entry.billable,
					startedAt: entry.startedAt ? String(entry.startedAt) : null,
				}))}
			/>
		);
	}
	if (module === "files" && files.data) {
		return (
			<FilesView
				workspaceId={workspace}
				folders={files.data.folders.map((folder) => ({
					id: folder.id,
					name: folder.name,
					parentId: folder.parentId,
				}))}
				documents={files.data.documents.map((document) => {
					const versions = Array.isArray(document.versions)
						? (document.versions as Array<{
								versionNumber: number;
								originalName?: string;
								category?: string | null;
								sizeBytes?: number;
							}>)
						: [];
					const current = versions.find(
						(version) =>
							version.versionNumber === document.currentVersionNumber,
					);
					return {
						id: document.id,
						title: document.title,
						description: document.description,
						folderId: document.folderId,
						status: document.status as "active" | "archived" | "trashed",
						tags: Array.isArray(document.tags)
							? document.tags.filter(
									(tag): tag is string => typeof tag === "string",
								)
							: [],
						version: current?.versionNumber ?? null,
						fileName: current?.originalName ?? null,
						category: current?.category ?? null,
						sizeBytes: current?.sizeBytes ?? null,
					};
				})}
			/>
		);
	}
	if (module === "reporting-analytics" && reporting.data) {
		return (
			<ReportingView
				report={reporting.data.report as unknown as WorkspaceReport}
				days={reportDays}
				granularity={reportGranularity}
				timeZone={reporting.data.timeZone}
			/>
		);
	}
	return (
		<main className="space-y-4 p-6">
			<h1 className="font-semibold text-2xl capitalize">
				{module.replaceAll("-", " ")}
			</h1>
			<p className="text-muted-foreground">
				This module is connected to the QuickDash API. Its operational view is
				being moved from the legacy server component.
			</p>
		</main>
	);
}

export const Route = createFileRoute("/$workspace/$module")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		days?: number;
		granularity?: string;
		q?: string;
		status?: string;
		sort?: string;
		page?: number;
	} => ({
		days: search.days === undefined ? undefined : Number(search.days),
		granularity:
			search.granularity === undefined ? undefined : String(search.granularity),
		q: search.q === undefined ? undefined : String(search.q),
		status: search.status === undefined ? undefined : String(search.status),
		sort: search.sort === undefined ? undefined : String(search.sort),
		page: search.page === undefined ? undefined : Number(search.page),
	}),
	component: ModulePage,
});
