import {
	AddressBook,
	Article,
	Briefcase,
	Buildings,
	CalendarBlank,
	Camera,
	ChartBar,
	ChatCircle,
	ClipboardText,
	CloudArrowUp,
	Coins,
	CreditCard,
	Envelope,
	FileText,
	FolderSimple,
	Gift,
	Hammer,
	type Icon,
	Kanban,
	Lifebuoy,
	MapPin,
	Package,
	Percent,
	Receipt,
	Repeat,
	ShoppingCart,
	Star,
	Storefront,
	Tag,
	Timer,
	Truck,
	User,
	UsersThree,
	Wallet,
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

/**
 * Icons for the module picker, keyed by module id.
 *
 * Icons deliberately live here rather than in the module manifests: a manifest is a
 * server-side contract (schema, dependencies, metering) and has no business carrying a React
 * component. A module with no entry falls back rather than breaking the grid, so a newly
 * shipped module appears immediately even before anyone picks an icon for it.
 */
const MODULE_ICONS: Record<string, Icon> = {
	// Built — from the registry.
	"client-records": AddressBook,
	invoicing: Receipt,
	payments: CreditCard,
	fulfillment: Truck,
	files: FolderSimple,
	"products-services": Tag,
	orders: ShoppingCart,
	inventory: Package,
	shipping: Truck,
	bookings: CalendarBlank,
	"projects-tasks": Kanban,
	"time-tracking": Timer,
	"quotes-estimates": FileText,
	"contracts-esign": ClipboardText,
	"reporting-analytics": ChartBar,
	// Upcoming.
	"forms-intake": ClipboardText,
	notifications: ChatCircle,
	subscriptions: Repeat,
	expenses: Wallet,
	suppliers: Truck,
	discounts: Percent,
	locations: MapPin,
	"production-jobs": Hammer,
	"content-cms": Article,
	"sales-pipeline": Kanban,
	"client-communications": ChatCircle,
	reviews: Star,
	support: Lifebuoy,
	tax: Receipt,
	loyalty: Star,
	"gift-cards": Gift,
	returns: Repeat,
	auctions: Coins,
	"email-marketing": Envelope,
	referrals: UsersThree,
};

/**
 * What each business type preselects — the "recipe". Ids only; the catalog decides what
 * actually exists, so an id listed here that isn't built yet is simply ignored rather than
 * offering the user something that doesn't work.
 *
 * Every recipe includes Client Records, Invoicing, Payments, and Fulfillment: they are the
 * sensible default for a new workspace, but they are no longer *locked* — #173 removed that
 * hard requirement, and a user may switch any of them off.
 */
const FOUNDATION = [
	"client-records",
	"invoicing",
	"payments",
	"fulfillment",
] as const;

export const RECIPE_MODULES: Record<string, readonly string[]> = {
	ecommerce: [
		...FOUNDATION,
		"products-services",
		"orders",
		"inventory",
		"shipping",
	],
	agency: [
		...FOUNDATION,
		"quotes-estimates",
		"projects-tasks",
		"time-tracking",
		"contracts-esign",
	],
	freelancer: [
		...FOUNDATION,
		"quotes-estimates",
		"time-tracking",
		"contracts-esign",
		"files",
	],
	saas: [...FOUNDATION, "reporting-analytics", "files"],
	creator: [...FOUNDATION, "products-services", "orders", "files", "bookings"],
	consulting: [
		...FOUNDATION,
		"quotes-estimates",
		"projects-tasks",
		"time-tracking",
		"contracts-esign",
	],
};

export function moduleIcon(id: string): Icon {
	return MODULE_ICONS[id] ?? Package;
}

export function businessTypeName(typeId: string): string {
	return BUSINESS_TYPES.find((t) => t.id === typeId)?.name ?? "workspace";
}
