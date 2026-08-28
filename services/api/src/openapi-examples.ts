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
const SUPPLIER = "3f1b2c40-0000-4000-8000-00000000da01";
const PROJECT = "3f1b2c40-0000-4000-8000-00000000pr01".replace("pr", "b0");
const ORDER = "3f1b2c40-0000-4000-8000-00000000or01".replace("or", "c2");
const FILE_VERSION = "3f1b2c40-0000-4000-8000-00000000f101".replace("f1", "d3");
const ORDER_LINE = "3f1b2c40-0000-4000-8000-00000000c201".replace("c2", "e4");

export const REQUEST_EXAMPLES: Record<string, unknown> = {
	// `captureCheckoutPayment` is bodyless, so it correctly has no example here.
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
	getCatalogAvailability: { catalogItemIds: [CATALOG_ITEM] },
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
	connectSupplierPaymentAccount: {
		returnUrl: "https://quickdash.xyz/suppliers/connected",
		refreshUrl: "https://quickdash.xyz/suppliers/reconnect",
		country: "CA",
	},
	createSupplier: {
		name: "EZPZ Coffee",
		contactName: "Liam Garneau",
		contactEmail: "orders@example.com",
		handoffMethod: "unknown",
		leadTimeDays: 3,
	},
	updateSupplier: {
		handoffMethod: "api",
		handoffTarget: "https://example.com/v1",
	},
	createSupplierSku: {
		supplierId: SUPPLIER,
		catalogItemId: CATALOG_ITEM,
		supplierSku: "ETH-GUJI-340",
		unitCostCents: 1500,
		currency: "CAD",
	},
	updateSupplierSku: { unitCostCents: 1450, leadTimeDays: 2 },
	saveSupplierConnection: {
		supplierId: SUPPLIER,
		provider: "shopify",
		shopDomain: "example.myshopify.com",
		// Illustrative only. Both are write-only and no route ever returns them.
		//
		// Client credentials rather than a token: Shopify retired admin-created
		// custom apps, so a new store cannot be issued a permanent one. These are
		// exchanged for a token that expires in 24 hours. `adminAccessToken` is
		// still accepted for stores connected before that change.
		clientId: "00000000000000000000000000000000",
		clientSecret: "shpss_example_secret",
		apiVersion: "2026-07",
	},
	checkSupplierConnection: { supplierId: SUPPLIER, provider: "shopify" },

	saveCarrierConnection: {
		carrier: "shippo",
		environment: "test",
		// Illustrative only. The real token is write-only and no route ever
		// returns one.
		apiToken: "shippo_test_example_token",
	},
	checkCarrierConnection: { carrier: "shippo", environment: "test" },

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
	saveView: {
		moduleId: "invoicing",
		name: "Unpaid",
		state: { status: "overdue", sort: "dueAt", direction: "asc" },
		pinned: true,
	},
	pinSavedView: { pinned: true },
	requestCustomerSignInLink: {
		email: "ash@example.com",
	},
	verifyCustomerSignInLink: {
		token: "0xQnJvd3NlcnMgc2VuZCB0aGlzIGJhY2sgdmVyYmF0aW0",
	},
	redeemPortalHandoff: {
		token: "0xVGhpcyBvbmUgbGl2ZXMgZm9yIHNpeHR5IHNlY29uZHM",
	},
	recordProductEvent: {
		name: "signup.viewed",
		surface: "web",
		attribution: { utm_source: "twitter", utm_campaign: "launch-week" },
	},
	createCreditTopUp: {
		pack: "medium",
		billingEmail: "billing@northwind.example",
		savePaymentMethod: false,
	},
	setAutoRecharge: {
		enabled: true,
		thresholdMicros: 50_000_000,
		amountCents: 2_500,
	},
	createOrganization: { name: "Northwind Holdings" },
	createApiKey: {
		workspaceId: "3f1c9b52-8d64-4a1e-9f77-2c5e0d6b8a41",
		name: "Production server",
		type: "secret",
		capabilities: ["clients:read", "invoicing:write"],
	},
	updateApiKeyOrigins: {
		workspaceId: "3f1c9b52-8d64-4a1e-9f77-2c5e0d6b8a41",
		allowedOrigins: ["https://gemsutopia.ca", "https://www.gemsutopia.ca"],
	},
	startSubscription: {
		planId: "grow",
		cycle: "annual",
		billingEmail: "billing@northwind.example",
		seats: 5,
	},
	confirmAccountSubscription: {
		subscriptionId: "sub_1234567890",
	},
	recommendAccountOnboarding: {
		description: "A small agency that manages client projects and invoices",
		recipes: [
			{
				id: "agency",
				name: "Agency",
				category: "Professional services",
				keywords: ["agency", "clients", "projects"],
				moduleIds: ["client-records", "projects-tasks", "invoicing"],
			},
		],
	},
	inviteMember: {
		email: "sam@northwind.example",
		role: "Bookkeeper",
	},
	changeMemberRole: {
		role: "Bookkeeper",
	},
	createAccountRole: {
		name: "Bookkeeper",
		description: "Reconciles invoices and payments, sees no customer data.",
		capabilities: ["workspace.view", "records.write"],
	},
	updateAccountRole: {
		capabilities: ["workspace.view", "records.write", "billing.manage"],
	},
	createWorkspace: {
		name: "Northwind Trading",
		businessType: "ecommerce",
		moduleIds: ["client-records", "invoicing"],
	},
	renameWorkspace: { name: "Northwind Trading Co." },
	setWorkspaceArchived: { archived: true },
	setWorkspaceEnvironment: { environment: "test" },
	setWorkspacePublished: { published: false },
	setWorkspaceModuleEnabled: { enabled: true },
	registerContentManifest: {
		slots: [
			{
				key: "about.heading",
				type: "text",
				label: "About — heading",
				group: "About",
			},
			{
				key: "about.body",
				type: "richtext",
				label: "About — body",
				group: "About",
			},
		],
	},
	setContentPublished: { keys: ["about.body"], published: true },
	addToWishlist: { catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90" },
	mergeWishlist: {
		items: [{ catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90" }],
	},
	createReview: {
		catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90",
		rating: 5,
		title: "Beautiful stone",
		body: "Exactly as described, and it arrived in two days.",
	},
	moderateReview: { status: "published" },
	reviewSummary: {
		catalogItemIds: ["3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90"],
	},
	setPortalDomain: { domain: "account.gemsutopia.ca" },
	createCustomerConversation: {
		subject: "Question about my order",
		body: "Could you confirm when it will ship?",
	},
	replyToCustomerConversation: { body: "Thank you, that answers my question." },
	createOperatorCustomerConversation: {
		clientRecordId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90",
		subject: "Your order is ready",
		body: "Your order is packed and ready for collection.",
	},
	replyToOperatorCustomerConversation: { body: "It will be ready after 3 PM." },
	setCustomerConversationStatus: { status: "closed" },
	createCategory: {
		kind: "category",
		name: "Rings",
		slug: "rings",
		sortOrder: 10,
	},
	updateCategory: { name: "Signet rings", sortOrder: 20 },
	setItemCategories: {
		categoryIds: ["3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90"],
	},
	upsertContentEntry: {
		key: "about.body",
		type: "richtext",
		value: "We have been sourcing gemstones from Alberta since 2019.",
		label: "About — body text",
		group: "About",
		published: true,
	},
	setPartnerLinkActive: { active: false },
	setSubscriptionStatus: { status: "paused" },
	createInvoiceForOrder: { orderId: ORDER },
	createSubscriptionPlan: {
		name: "Monthly \u2014 The Build",
		interval: "month",
		intervalCount: 1,
		priceCents: 4200,
		items: [{ catalogItemId: CATALOG_ITEM, quantity: 1 }],
	},
	issuePartnerLink: {
		clientRecordId: CLIENT,
		code: "SARAHBREWS",
		commissionBasisPoints: 1000,
	},
	createDiscount: {
		name: "Summer sale",
		code: "SUMMER10",
		valueType: "percentage",
		value: 1000,
		minimumSubtotalCents: 5_000,
	},
	updateDiscount: { active: false },
	previewDiscount: {
		code: "SUMMER10",
		items: [
			{ catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90", quantity: 1 },
		],
	},
	createShippingZone: {
		name: "Canada",
		countryCodes: ["CA"],
		regionCodes: [],
		priority: 0,
		active: true,
	},
	updateShippingZone: { priority: 10 },
	createShippingRate: {
		zoneId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90",
		name: "Standard",
		baseCents: 1_200,
		freeOverCents: 10_000,
		estimatedDaysMin: 3,
		estimatedDaysMax: 5,
		active: true,
	},
	updateShippingRate: { baseCents: 1_500 },
	quoteShipping: {
		items: [
			{ catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90", quantity: 1 },
		],
		destination: {
			countryCode: "CA",
			regionCode: "CA-AB",
			postalCode: "T5J 0N3",
		},
	},
	quoteCheckoutTotal: {
		items: [
			{ catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90", quantity: 1 },
		],
		shippingRateId: "8c2d4e6f-1a3b-4c5d-9e0f-7a8b9c0d1e2f",
		shippingAddress: {
			name: "Sam Rivera",
			line1: "1 Hampton Crescent",
			city: "Sylvan Lake",
			region: "AB",
			postalCode: "T4S 0N2",
			countryCode: "CA",
		},
	},
	createCheckout: {
		items: [
			{ catalogItemId: "3f1b7a52-6c2d-4f8e-9a10-2b5c6d7e8f90", quantity: 1 },
		],
		email: "buyer@example.com",
		name: "Sam Rivera",
	},
	submitContact: {
		name: "Sam Rivera",
		email: "sam@example.com",
		topic: "Pricing or plans",
		message:
			"We run a two-location bike shop and want to move bookings and invoicing off spreadsheets. Which plan covers both?",
		// ⚠️ The honeypot is documented as empty ON PURPOSE. It is the value a
		// real client sends, and showing it here stops anyone integrating against
		// this endpoint from "helpfully" populating it and having every
		// submission silently dropped.
		website: "",
	},
	// getCustomerOrder takes only the documented order UUID path parameter.
	startPaymentOnboarding: {
		returnUrl: "https://account.quickdash.xyz/payments?connected=1",
		refreshUrl: "https://account.quickdash.xyz/payments",
		country: "CA",
	},
	// 🔴 A deliberately fake secret. This document is public, and an example is
	// the easiest place in a codebase to leave a real credential by accident.
	connectProviderCredentials: {
		provider: "paypal",
		clientId: "AaBbCc-ExampleClientId",
		clientSecret: "EXAMPLE-not-a-real-secret",
		webhookId: "WH-0EXAMPLE0000000",
	},
	setDefaultPaymentProvider: { provider: "paypal" },
	createRole: {
		name: "Bookkeeper",
		description: "Keeps the books, cannot change the team",
		capabilities: ["workspace.view", "records.write"],
	},
	updateRole: { capabilities: ["workspace.view"] },
};
