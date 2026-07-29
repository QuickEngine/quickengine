import {
	AddressBook,
	Article,
	CalendarBlank,
	ChartBar,
	ChatCircle,
	ClipboardText,
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
	Tag,
	Timer,
	Truck,
	UsersThree,
	Wallet,
} from "@phosphor-icons/react";

/**
 * The default starting set when no recipe is chosen — the manual and fast paths seed from
 * this. Not a lock: every one can be switched off, subject only to real dependencies.
 * Recipes live in `./recipes`; this is only the fallback when the user picks none.
 */
export const FOUNDATION = [
	"client-records",
	"invoicing",
	"payments",
	"fulfillment",
] as const;

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

export function moduleIcon(id: string): Icon {
	return MODULE_ICONS[id] ?? Package;
}
