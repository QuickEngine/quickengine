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
	FolderSimple,
	type Icon,
	Kanban,
	Lightning,
	Package,
	PencilRuler,
	Receipt,
	ShoppingCart,
	Storefront,
	User,
	UsersThree,
} from "@phosphor-icons/react";

// Placeholder tier ladder + gating. Which modules sit behind which tier is a
// monetization decision (Asher + Reese); these are reasonable starting picks.
export type Tier = "free" | "starter" | "pro" | "growth" | "team";

export const TIER_LABEL: Record<Tier, string> = {
	free: "Free",
	starter: "Starter",
	pro: "Pro",
	growth: "Growth",
	team: "Team",
};

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
	tier: Tier;
	icon: Icon;
	types?: string[]; // industry-only: which business types include it
};

// The building blocks. Shared modules are available on every workspace; industry
// modules only appear for the business types that list them.
export const MODULES: ModuleDef[] = [
	{
		id: "clients",
		name: "Client records",
		description: "Customers, contacts, and their history.",
		category: "shared",
		tier: "free",
		icon: AddressBook,
	},
	{
		id: "invoicing",
		name: "Invoicing & payments",
		description: "Send invoices and get paid.",
		category: "shared",
		tier: "free",
		icon: Receipt,
	},
	{
		id: "files",
		name: "File storage",
		description: "Store and share your documents.",
		category: "shared",
		tier: "free",
		icon: FolderSimple,
	},
	{
		id: "comms",
		name: "Communications",
		description: "Messages and notifications in one place.",
		category: "shared",
		tier: "free",
		icon: ChatCircle,
	},
	{
		id: "scheduling",
		name: "Scheduling",
		description: "Bookings, calendars, and reminders.",
		category: "shared",
		tier: "starter",
		icon: CalendarBlank,
	},
	{
		id: "reporting",
		name: "Reporting",
		description: "Dashboards and insights across your data.",
		category: "shared",
		tier: "pro",
		icon: ChartBar,
	},
	{
		id: "automation",
		name: "Automation",
		description: "Trigger actions and workflows automatically.",
		category: "shared",
		tier: "pro",
		icon: Lightning,
	},
	{
		id: "team",
		name: "Team & roles",
		description: "Invite people and manage permissions.",
		category: "shared",
		tier: "team",
		icon: UsersThree,
	},
	{
		id: "orders",
		name: "Order management",
		description: "Track and fulfill orders end to end.",
		category: "industry",
		tier: "free",
		icon: ShoppingCart,
		types: ["ecommerce"],
	},
	{
		id: "inventory",
		name: "Inventory",
		description: "Stock levels, variants, and restocking.",
		category: "industry",
		tier: "starter",
		icon: Package,
		types: ["ecommerce"],
	},
	{
		id: "subscriptions",
		name: "Subscriptions & churn",
		description: "Recurring plans and retention metrics.",
		category: "industry",
		tier: "pro",
		icon: ArrowsClockwise,
		types: ["saas"],
	},
	{
		id: "projects",
		name: "Projects & retainers",
		description: "Track project work and retainers.",
		category: "industry",
		tier: "starter",
		icon: Kanban,
		types: ["agency", "consulting", "freelancer"],
	},
	{
		id: "content",
		name: "Content & publishing",
		description: "Plan and schedule your content.",
		category: "industry",
		tier: "starter",
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
