export type ModuleNavigationItem = {
	id: string;
	label: string;
	description: string;
};

export const MODULE_NAVIGATION: Readonly<
	Record<string, Omit<ModuleNavigationItem, "id">>
> = {
	"client-records": {
		label: "Client Records",
		description: "Customers, contacts, and client history.",
	},
	invoicing: {
		label: "Invoicing",
		description: "Invoices, line items, and payment status.",
	},
	payments: {
		label: "Payments",
		description: "Transactions, refunds, and payment activity.",
	},
	fulfillment: {
		label: "Fulfillment",
		description: "Track work promised and delivered.",
	},
	files: {
		label: "Files & Documents",
		description: "Workspace files, versions, and documents.",
	},
	"products-services": {
		label: "Products & Services",
		description: "The things this business sells.",
	},
	orders: {
		label: "Orders",
		description: "Customer purchases and order lifecycles.",
	},
	inventory: {
		label: "Inventory",
		description: "Stock, reservations, and availability.",
	},
	shipping: {
		label: "Shipping",
		description: "Shipments, packages, and delivery tracking.",
	},
	bookings: {
		label: "Bookings",
		description: "Appointments and reserved time.",
	},
	"projects-tasks": {
		label: "Projects & Tasks",
		description: "Plan client and internal delivery work.",
	},
	"time-tracking": {
		label: "Time Tracking",
		description: "Record billable and internal time.",
	},
	"quotes-estimates": {
		label: "Quotes & Estimates",
		description: "Prepare and track proposals before invoicing.",
	},
	"contracts-esign": {
		label: "Contracts & E-sign",
		description: "Agreements, revisions, and signatures.",
	},
	"reporting-analytics": {
		label: "Reporting & Analytics",
		description: "Operational health and business performance.",
	},
};

export function getModuleNavigation(id: string): ModuleNavigationItem | null {
	const item = MODULE_NAVIGATION[id];
	return item ? { id, ...item } : null;
}
