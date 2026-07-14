import {
	AddressBook,
	ArrowsClockwise,
	Briefcase,
	Buildings,
	CalendarBlank,
	Camera,
	ChartBar,
	ChatCircle,
	CloudArrowUp,
	CreditCard,
	FolderSimple,
	type Icon,
	Kanban,
	Lightning,
	Package,
	PencilRuler,
	Receipt,
	ShoppingCart,
	Storefront,
	Truck,
	User,
	UsersThree,
} from "@phosphor-icons/react";

export type BusinessType = { id: string; name: string; icon: Icon };

// Business types = recipes. Picking one preselects a curated set of modules.
export const BUSINESS_TYPES: BusinessType[] = [
	{ id: "ecommerce", name: "E-commerce", icon: Storefront },
	{ id: "agency", name: "Agency", icon: Buildings },
	{ id: "freelancer", name: "Freelancer", icon: User },
	{ id: "saas", name: "SaaS", icon: CloudArrowUp },
	{ id: "creator", name: "Creator", icon: Camera },
	{ id: "consulting", name: "Consulting", icon: Briefcase },
];

export type ModuleDef = {
	id: string;
	name: string;
	description: string;
	category: "shared" | "industry";
	status: "built" | "coming-soon";
	required?: boolean;
	icon: Icon;
	types?: string[]; // industry-only: which business types include it
};

// The building blocks. Shared modules are available on every workspace; industry
// modules only appear for the business types that list them.
export const MODULES: ModuleDef[] = [
	{
		id: "client-records",
		name: "Client records",
		description: "Customers, contacts, and their history.",
		category: "shared",
		status: "built",
		required: true,
		icon: AddressBook,
	},
	{
		id: "invoicing",
		name: "Invoicing",
		description: "Create, send, and track invoices.",
		category: "shared",
		status: "built",
		required: true,
		icon: Receipt,
	},
	{
		id: "payments",
		name: "Payments",
		description: "Collect money and reconcile paid invoices.",
		category: "shared",
		status: "built",
		required: true,
		icon: CreditCard,
	},
	{
		id: "fulfillment",
		name: "Fulfillment",
		description: "Deliver the product, service, file, or completed work.",
		category: "shared",
		status: "built",
		required: true,
		icon: Truck,
	},
	{
		id: "files",
		name: "File storage",
		description: "Store and share your documents.",
		category: "shared",
		status: "coming-soon",
		icon: FolderSimple,
	},
	{
		id: "comms",
		name: "Communications",
		description: "Messages and notifications in one place.",
		category: "shared",
		status: "coming-soon",
		icon: ChatCircle,
	},
	{
		id: "scheduling",
		name: "Scheduling",
		description: "Bookings, calendars, and reminders.",
		category: "shared",
		status: "coming-soon",
		icon: CalendarBlank,
	},
	{
		id: "reporting",
		name: "Reporting",
		description: "Dashboards and insights across your data.",
		category: "shared",
		status: "coming-soon",
		icon: ChartBar,
	},
	{
		id: "automation",
		name: "Automation",
		description: "Trigger actions and workflows automatically.",
		category: "shared",
		status: "coming-soon",
		icon: Lightning,
	},
	{
		id: "team",
		name: "Team & roles",
		description: "Invite people and manage permissions.",
		category: "shared",
		status: "coming-soon",
		icon: UsersThree,
	},
	{
		id: "orders",
		name: "Order management",
		description: "Track and fulfill orders end to end.",
		category: "industry",
		status: "coming-soon",
		icon: ShoppingCart,
		types: ["ecommerce"],
	},
	{
		id: "inventory",
		name: "Inventory",
		description: "Stock levels, variants, and restocking.",
		category: "industry",
		status: "coming-soon",
		icon: Package,
		types: ["ecommerce"],
	},
	{
		id: "subscriptions",
		name: "Subscriptions & churn",
		description: "Recurring plans and retention metrics.",
		category: "industry",
		status: "coming-soon",
		icon: ArrowsClockwise,
		types: ["saas"],
	},
	{
		id: "projects",
		name: "Projects & retainers",
		description: "Track project work and retainers.",
		category: "industry",
		status: "coming-soon",
		icon: Kanban,
		types: ["agency", "consulting", "freelancer"],
	},
	{
		id: "content",
		name: "Content & publishing",
		description: "Plan and schedule your content.",
		category: "industry",
		status: "coming-soon",
		icon: PencilRuler,
		types: ["creator"],
	},
];

// Every module relevant to a business type: all shared ones + its industry ones.
export function modulesForType(typeId: string): ModuleDef[] {
	return MODULES.filter(
		(m) => m.category === "shared" || m.types?.includes(typeId),
	);
}

export function businessTypeName(typeId: string): string {
	return BUSINESS_TYPES.find((t) => t.id === typeId)?.name ?? "workspace";
}
