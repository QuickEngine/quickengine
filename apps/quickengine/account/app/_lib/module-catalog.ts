import { listModules } from "@quickengine/module-registry";

/**
 * The onboarding module catalog, derived from the real module registry.
 *
 * This file exists because the previous hand-maintained list drifted badly: it offered 5 of
 * 15 built modules, padlocked 5 that had shipped weeks earlier (Files, Bookings, Orders,
 * Inventory, Projects), omitted 5 entirely, and still marked the 4 foundation modules
 * `required` after that rule was deliberately removed. Deriving from `listModules()` makes
 * that class of drift impossible — shipping a module makes it appear here automatically,
 * with no onboarding change and nothing to remember to come back to.
 *
 * Server-only: the registry imports every module package (and their Drizzle schemas), which
 * must not reach the browser bundle. The page resolves this and passes plain data to the
 * client flow.
 */
export type OnboardingModule = {
	id: string;
	name: string;
	description: string;
	kind: "shared" | "domain";
	/** `built` is selectable now; `upcoming` is shown, labelled, and not selectable. */
	status: "built" | "upcoming";
	/**
	 * Modules this one composes on. Selecting it must bring these along — the server
	 * resolves them regardless, so the UI has to show the same truth or the user makes a
	 * choice that is silently overridden (e.g. unticking Fulfillment, then selecting
	 * Shipping, which requires Orders, which requires Fulfillment).
	 */
	dependsOn: readonly string[];
};

/**
 * Modules that are planned but genuinely not built yet — the canonical second-wave list in
 * `docs/product/MODULES.md`. Listing them keeps the picker honest (nothing here pretends to
 * work) while shaping the grid for the catalog's real eventual size rather than today's 15.
 *
 * When one of these ships, it gains a manifest and moves into the registry — at which point
 * it appears as `built` automatically and its entry here should be deleted.
 */
const UPCOMING: readonly Omit<OnboardingModule, "status" | "dependsOn">[] = [
	{
		id: "forms-intake",
		name: "Forms & Intake",
		description: "Public forms that create records in your workspace.",
		kind: "shared",
	},
	{
		id: "notifications",
		name: "Notifications",
		description: "In-app and email alerts for what matters.",
		kind: "shared",
	},
	{
		id: "subscriptions",
		name: "Subscriptions",
		description: "Recurring plans, renewals, and churn.",
		kind: "domain",
	},
	{
		id: "expenses",
		name: "Expenses & Bookkeeping",
		description: "Track spending and reconcile the books.",
		kind: "shared",
	},
	{
		id: "suppliers",
		name: "Suppliers & Purchasing",
		description: "Supplier records, purchase orders, and receiving.",
		kind: "domain",
	},
	{
		id: "discounts",
		name: "Discounts & Promotions",
		description: "Codes, offers, eligibility, and date windows.",
		kind: "domain",
	},
	{
		id: "locations",
		name: "Locations & Resources",
		description: "Sites, rooms, equipment, and capacity.",
		kind: "domain",
	},
	{
		id: "production-jobs",
		name: "Production Jobs",
		description: "Custom production work from order to finished piece.",
		kind: "domain",
	},
	{
		id: "content-cms",
		name: "Content & CMS",
		description: "Pages, posts, and editable site content.",
		kind: "domain",
	},
	{
		id: "sales-pipeline",
		name: "Sales Pipeline",
		description: "Leads, deals, stages, and follow-ups.",
		kind: "domain",
	},
	{
		id: "client-communications",
		name: "Client Communications",
		description: "Conversations with customers in one thread.",
		kind: "shared",
	},
	{
		id: "reviews",
		name: "Reviews & Feedback",
		description: "Collect and publish customer reviews.",
		kind: "domain",
	},
	{
		id: "support",
		name: "Support & Tickets",
		description: "Customer requests tracked to resolution.",
		kind: "shared",
	},
	{
		id: "tax",
		name: "Tax",
		description: "Rates, jurisdictions, and calculation snapshots.",
		kind: "domain",
	},
	{
		id: "loyalty",
		name: "Loyalty & Rewards",
		description: "Points, tiers, and store credit.",
		kind: "domain",
	},
	{
		id: "gift-cards",
		name: "Gift Cards",
		description: "Issue, redeem, and track balances.",
		kind: "domain",
	},
	{
		id: "returns",
		name: "Returns & Exchanges",
		description: "Requests, inspection, restocking, and refunds.",
		kind: "domain",
	},
	{
		id: "auctions",
		name: "Auctions",
		description: "Listings, bidding windows, and winners.",
		kind: "domain",
	},
	{
		id: "email-marketing",
		name: "Email Marketing",
		description: "Audiences, campaigns, and delivery reporting.",
		kind: "domain",
	},
	{
		id: "referrals",
		name: "Referrals & Affiliates",
		description: "Attribution, conversions, and rewards.",
		kind: "domain",
	},
];

/**
 * Every module onboarding should show: the built ones straight from the registry, then the
 * planned ones. Plain serializable objects — safe to hand to a client component.
 */
export function buildOnboardingCatalog(): OnboardingModule[] {
	const built: OnboardingModule[] = listModules().map((manifest) => ({
		id: manifest.id,
		name: manifest.name,
		description: manifest.description,
		kind: manifest.kind,
		dependsOn: manifest.dependsOn,
		status: "built",
	}));
	const upcoming: OnboardingModule[] = UPCOMING.map((module) => ({
		...module,
		dependsOn: [],
		status: "upcoming",
	}));
	return [...built, ...upcoming];
}
