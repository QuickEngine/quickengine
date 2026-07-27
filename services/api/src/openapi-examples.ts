/**
 * Request examples, keyed by `operationId`.
 *
 * Every one is **parsed through its real schema by `openapi.test.ts`**. An example
 * that no longer validates fails the build, which is the only way documentation
 * examples stay true — an unchecked example is a promise nobody is keeping.
 *
 * They share a cast (Ada Lovelace at Analytical Engines) so a reader following the
 * docs top to bottom sees one coherent story rather than fifty unrelated fixtures.
 */

const CLIENT = "3f1b2c40-0000-4000-8000-00000000c001";
const CATALOG_ITEM = "3f1b2c40-0000-4000-8000-00000000ca01";
const PROJECT = "3f1b2c40-0000-4000-8000-00000000pr01".replace("pr", "b0");
const ORDER = "3f1b2c40-0000-4000-8000-00000000or01".replace("or", "c2");
const FILE_VERSION = "3f1b2c40-0000-4000-8000-00000000f101".replace("f1", "d3");
const ORDER_LINE = "3f1b2c40-0000-4000-8000-00000000c201".replace("c2", "e4");

export const REQUEST_EXAMPLES: Record<string, unknown> = {
	createClient: {
		name: "Ada Lovelace",
		email: "ada@analyticalengines.example",
		company: "Analytical Engines",
	},
	updateClient: { company: "Analytical Engines Ltd" },
	createClientAddress: {
		label: "Head office",
		line1: "12 Devonshire Street",
		city: "London",
		postalCode: "W1G 7AB",
		countryCode: "GB",
	},
	updateClientAddress: { line1: "14 Devonshire Street" },

	createCatalogItem: {
		name: "Implementation",
		type: "service",
		pricingModel: "hourly",
		priceCents: 8_000,
		currency: "GBP",
		unitLabel: "hour",
	},
	updateCatalogItem: { priceCents: 9_000 },
	createProductVariant: { options: [{ name: "Tier", value: "Senior" }] },
	updateProductVariant: { sku: "IMP-SENIOR" },

	createQuote: {
		clientId: CLIENT,
		kind: "quote",
		title: "Website redesign",
		validUntil: "2026-09-30",
		lines: [
			{
				name: "Implementation",
				quantity: 20,
				unitLabel: "hour",
				unitPriceCents: 8_000,
			},
		],
	},
	updateDraftQuote: {
		clientId: CLIENT,
		kind: "quote",
		title: "Website redesign (revised)",
		lines: [{ name: "Implementation", quantity: 24, unitPriceCents: 8_000 }],
	},
	acceptQuote: {
		acceptedByName: "Ada Lovelace",
		acceptedByEmail: "ada@analyticalengines.example",
	},

	createInvoice: {
		clientId: CLIENT,
		lineItems: [
			{
				description: "Implementation — 20 hours",
				quantity: 20,
				unitPriceCents: 8_000,
			},
		],
	},
	updateDraftInvoice: {
		lineItems: [
			{
				description: "Implementation — 24 hours",
				quantity: 24,
				unitPriceCents: 8_000,
			},
		],
	},
	recordPayment: { amountCents: 160_000, reference: "BACS 4471" },
	refundPayment: { amountCents: 20_000, reason: "Scope reduced by agreement" },

	createOrder: {
		clientId: CLIENT,
		lines: [
			{
				name: "Implementation",
				type: "service",
				quantity: 2,
				unitPriceCents: 8_000,
			},
		],
	},
	updateDraftOrder: {
		clientId: CLIENT,
		lines: [
			{
				name: "Implementation",
				type: "service",
				quantity: 3,
				unitPriceCents: 8_000,
			},
		],
	},
	createFulfillment: { title: "Deliver the redesign" },

	createInventoryItem: { catalogItemId: CATALOG_ITEM, lowStockThreshold: 5 },
	updateInventoryItem: { catalogItemId: CATALOG_ITEM, lowStockThreshold: 10 },
	applyInventoryAdjustment: {
		kind: "receive",
		quantity: 25,
		note: "Restock from supplier",
	},

	createShipment: {
		orderId: ORDER,
		lines: [{ orderLineItemId: ORDER_LINE, quantity: 1 }],
		destination: {
			recipientName: "Ada Lovelace",
			line1: "12 Devonshire Street",
			city: "London",
			postalCode: "W1G 7AB",
			countryCode: "GB",
		},
		parcels: [{ weightGrams: 1_200 }],
	},
	updateDraftShipment: {
		orderId: ORDER,
		lines: [{ orderLineItemId: ORDER_LINE, quantity: 1 }],
		destination: {
			recipientName: "Ada Lovelace",
			line1: "12 Devonshire Street",
			city: "London",
			postalCode: "W1G 7AB",
			countryCode: "GB",
		},
		parcels: [{ weightGrams: 1_400 }],
	},
	updateShipmentTracking: {
		carrier: "Royal Mail",
		trackingNumber: "AB123456789GB",
	},

	createProject: { name: "Website redesign", clientId: CLIENT },
	updateProject: { name: "Website redesign — phase 2" },
	createMilestone: { projectId: PROJECT, name: "Design sign-off" },
	updateMilestone: { projectId: PROJECT, name: "Design sign-off (revised)" },
	createTask: { projectId: PROJECT, title: "Wireframe the dashboard" },
	updateTask: { projectId: PROJECT, title: "Wireframe the dashboard v2" },

	createBooking: {
		clientId: CLIENT,
		title: "Kickoff call",
		scheduleKey: "default",
		startsAt: "2026-08-03T09:00:00.000Z",
		endsAt: "2026-08-03T10:00:00.000Z",
		timeZone: "Europe/London",
	},
	updateBooking: {
		clientId: CLIENT,
		title: "Kickoff call (rescheduled)",
		scheduleKey: "default",
		startsAt: "2026-08-04T09:00:00.000Z",
		endsAt: "2026-08-04T10:00:00.000Z",
		timeZone: "Europe/London",
	},

	createManualTimeEntry: {
		projectId: PROJECT,
		trackerKey: "default",
		description: "Wireframing",
		workDate: "2026-08-03",
		durationSeconds: 5_400,
	},
	updateManualTimeEntry: {
		projectId: PROJECT,
		trackerKey: "default",
		billable: false,
	},
	startTimer: {
		projectId: PROJECT,
		trackerKey: "default",
		description: "Wireframing",
		startedAt: "2026-08-03T09:00:00.000Z",
		timeZone: "Europe/London",
	},

	createContract: {
		clientId: CLIENT,
		fileVersionId: FILE_VERSION,
		title: "Statement of work",
		signers: [{ name: "Ada Lovelace", email: "ada@analyticalengines.example" }],
	},
	updateDraftContract: {
		clientId: CLIENT,
		fileVersionId: FILE_VERSION,
		title: "Statement of work (v2)",
		signers: [{ name: "Ada Lovelace", email: "ada@analyticalengines.example" }],
	},

	createFileFolder: { name: "Contracts" },
	updateFileFolder: { name: "Signed contracts" },
	updateFileDocument: { title: "Statement of work — signed" },

	recordTrafficEvent: {
		eventId: "3f1b2c40-0000-4000-8000-00000000e001",
		siteKey: "site_live",
		visitorId: "visitor-9f2c41",
		sessionId: "session-41ab90",
		path: "/pricing",
		occurredAt: new Date("2026-08-03T09:00:00.000Z"),
	},
	createWebhookEndpoint: {
		url: "https://example.com/hooks/quickengine",
		description: "Production receiver",
		eventTypes: ["invoice.paid", "quote.accepted"],
	},
	updateWebhookEndpoint: { enabled: false },
	// A deliberately odd name, because the name is decoration: authorization reads
	// the permission list and never the label.
	createOrganization: { name: "Northwind Holdings" },
	createApiKey: {
		workspaceId: "3f1c9b52-8d64-4a1e-9f77-2c5e0d6b8a41",
		name: "Production server",
		type: "secret",
		capabilities: ["clients:read", "invoicing:write"],
	},
	startSubscription: {
		planId: "grow",
		cycle: "annual",
		billingEmail: "billing@northwind.example",
		seats: 5,
	},
	inviteMember: {
		email: "sam@northwind.example",
		role: "Bookkeeper",
	},
	createWorkspace: {
		name: "Northwind Trading",
		businessType: "ecommerce",
		moduleIds: ["client-records", "invoicing"],
	},
	renameWorkspace: { name: "Northwind Trading Co." },
	setWorkspaceArchived: { archived: true },
	setWorkspaceModuleEnabled: { enabled: true },
	createRole: {
		name: "Bookkeeper",
		description: "Keeps the books, cannot change the team",
		capabilities: ["workspace.view", "records.write"],
	},
	updateRole: { capabilities: ["workspace.view"] },
};
