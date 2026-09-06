/**
 * What settings CONTAINS, apart from how it is shown.
 *
 * 🔴 Lifted out of `settings-dialog.tsx` when settings stopped being a dialog.
 * The list of sections, their groups, their icons and their copy are the same
 * whether they are drawn in a rail, a page or a search result, and leaving them
 * inside one presentation meant the next one would have copied them.
 */
import {
	ArrowUUpLeftIcon,
	ChartBarIcon,
	EnvelopeSimpleIcon,
	GearSixIcon,
	type Icon,
	KeyIcon,
	PaletteIcon,
	PercentIcon,
	PlugsConnectedIcon,
	PlugsIcon,
	ShoppingCartIcon,
	SquaresFourIcon,
	StarIcon,
	TruckIcon,
	UserCircleIcon,
} from "@phosphor-icons/react";
import { useSaveRail } from "./controls";

/**
 * Workspace settings, as a dialog rather than a page.
 *
 * 🔑 Settings is somewhere you go MID-TASK — to change a prefix, add a key, fix
 * a sender address — and then carry on with what you were doing. A page throws
 * the work away and makes you navigate back to it; a dialog keeps it behind you
 * and returns you to it on close.
 *
 * 🔴 EVERY SECTION BELOW IS A STUB except the handful marked as built. This is
 * deliberate: the point of the list is to be the inventory of what a workspace
 * needs to be configurable, written down before any of it is built, so the shape
 * of the whole thing can be argued about while it is still cheap. A stub says
 * what it will hold and admits it holds nothing.
 *
 * ⚠️ Do not quietly delete a stub because it is empty. Each one is a decision
 * that something belongs in settings; removing it is a decision that it does
 * not, and that is worth saying out loud.
 */

/**
 * The frame every section's content sits in.
 *
 * ⚠️ One constant rather than a class on each branch: there are nine branches
 * and they drifted apart the moment there were three — one had a max width, one
 * had none, one had a different top margin.
 */
/**
 * ⚠️ NOT a card. A settings section is a LIST — label on the left, control on
 * the right, a hairline between rows — and boxing that inside a bordered panel
 * draws a frame around a frame. The pane is the surface; the rows are the
 * content.
 */
/**
 * ⚠️ NOT a card, and NOT capped.
 *
 * A settings section is a LIST — label on the left, control on the right, a
 * hairline between rows — so boxing it draws a frame around a frame. And a
 * max-width parks every control mid-pane with dead space beyond it; the row
 * should run the width it is given, with its control at the far edge.
 */

export const CARD = "";

/** One icon per page, so the rail can be scanned rather than read. */
export const ICONS: Readonly<Record<string, Icon>> = {
	general: GearSixIcon,
	branding: PaletteIcon,
	usage: ChartBarIcon,
	modules: SquaresFourIcon,
	integrations: PlugsIcon,
	checkout: ShoppingCartIcon,
	shipping: TruckIcon,
	returns: ArrowUUpLeftIcon,
	discounts: PercentIcon,
	accounts: UserCircleIcon,
	email: EnvelopeSimpleIcon,
	reviews: StarIcon,
	"api-keys": KeyIcon,
	webhooks: PlugsConnectedIcon,
};

export type Section = {
	id: string;
	label: string;
	/** What this section will let somebody change. Shown in the stub. */
	blurb: string;
	/** Where it already lives, if it is built somewhere else entirely. */
	built?: string;
	/**
	 * The ids `SettingsSections` knows this by. Set them and the dialog renders
	 * the real thing rather than describing it — one implementation, shown here.
	 *
	 * ⚠️ A LIST, because a dialog section is not always one page section.
	 * "General" is the workspace's name, its theme AND its environment, which
	 * were three separate blocks when this lived on a page.
	 */
	renders?: readonly string[];
	/** Extra words the in-dialog search should match on. */
	keywords?: string;
	/**
	 * The module this page is meaningless without.
	 *
	 * 🔑 Everybody gets the same settings — what differs is which modules they
	 * bought. A service business with no Orders has no checkout, no returns and
	 * no discount codes, so those pages are not "empty for them", they do not
	 * apply. Hiding beats showing a page whose every switch governs something
	 * the workspace cannot do.
	 */
	needs?: string;
};

export const GROUPS: Array<{ group: string; items: Section[] }> = [
	{
		group: "Workspace",
		items: [
			{
				id: "general",
				label: "General",
				blurb:
					"What this workspace is called, how it looks to you, and whether it takes real money.",
				// 🔴 These were described here and rendered nowhere. The page was
				// the only place appearance and environment existed, so deleting it
				// would have taken both with it.
				renders: ["appearance", "environment"],
				keywords:
					"name theme dark light appearance environment sandbox live id api",
			},
			{
				id: "branding",
				label: "Branding & links",
				blurb:
					"How you appear to customers, where your policies live, and your social profiles.",
				keywords:
					"logo colour email sender policy privacy terms instagram social footer",
			},
			{
				id: "usage",
				label: "Usage",
				blurb: "What this account has used against its plan.",
				keywords: "plan limit quota billing storage requests",
			},
			{
				id: "modules",
				label: "Modules",
				blurb: "What this workspace can do. Turn capabilities on and off.",
				keywords: "features capabilities enable disable",
			},
			{
				id: "integrations",
				label: "Integrations",
				/* 🔴 It had an icon in the console header, permanently, beside
				   controls that act on the page you are looking at. Connecting a
				   service is not something you do while working; it is something you
				   set up once and then forget, which is the definition of a setting.
				   Modules is the page right above it and answers the neighbouring
				   question, what this workspace can do on its own. */
				blurb: "What this workspace is connected to, and what it can reach.",
				keywords:
					"connect service provider stripe shopify resend oauth app install",
			},
		],
	},
	{
		group: "Selling",
		items: [
			{
				id: "checkout",
				label: "Checkout & tax",
				blurb:
					"What a customer has to give you, what an order has to be worth, and how tax is shown.",
				needs: "orders",
				keywords: "guest phone terms age minimum maximum vat gst duties",
			},
			{
				id: "shipping",
				label: "Shipping",
				blurb: "Where you ship from, and what a carrier is told.",
				renders: ["shipping"],
				needs: "shipping",
				keywords: "address parcel carrier tracking labels",
			},
			{
				id: "returns",
				label: "Returns",
				blurb:
					"How long somebody has, who pays, and what happens to the stock.",
				needs: "orders",
				keywords: "refund exchange restock rma",
			},
			{
				id: "discounts",
				label: "Discounts",
				blurb: "Whether codes can be combined, and how they are offered.",
				needs: "orders",
				keywords: "codes coupons promotions stacking",
			},
		],
	},
	{
		group: "Customers",
		items: [
			{
				id: "accounts",
				label: "Accounts & privacy",
				blurb:
					"Whether a shopper can have an account, what you keep about them, and for how long.",
				needs: "client-records",
				keywords:
					"register verify delete retention gdpr cookies consent export",
			},
			{
				id: "email",
				label: "Email & alerts",
				blurb:
					"What reaches your customers automatically, and what reaches you.",
				renders: ["email"],
				keywords:
					"notifications order shipped delivered review marketing summary",
			},
			{
				id: "reviews",
				label: "Reviews",
				blurb:
					"Who can leave one, and whether you see it before your customers do.",
				needs: "products-services",
				keywords: "moderation verified buyer photos rating",
			},
		],
	},
	{
		group: "Developers",
		items: [
			{
				id: "api-keys",
				label: "API keys",
				blurb: "Keys that let your own site and tools reach this workspace.",
				keywords: "secret storefront publishable token credentials revoke",
			},
			{
				id: "webhooks",
				label: "Webhooks",
				blurb: "Where events are posted, signed and retried.",
				keywords: "endpoint events signing secret deliveries retry",
			},
		],
	},
];

/**
 * The section's pinned title, and the slot its Save button lands in.
 *
 * ⚠️ A component rather than inline JSX because it calls `useSaveRail`, and a
 * hook cannot be called from inside the dialog's render branches.
 */
export function SectionHeader({ label }: { label: string }) {
	const { setRail } = useSaveRail();
	return (
		/* See the detail panel: spacing already separates a pinned title from the
		   content under it, and the rule only chops the panel up. */
		/* 🔴 It SCROLLS with the section, and no longer pins.
		   Pinning was right in a dialog: the pane was its own scroller inside a
		   fixed sheet, so a title that scrolled away left you reading switches
		   with no idea which section you were in. On a page the console already
		   carries the trail at the top, so a second sticky heading underneath it
		   was two headers competing for the same job.
		   The popover surface went for the same reason: it was the dialog's
		   plane, and it left a lighter bar across the top of every section. */
		<div className="flex min-h-[3.5rem] items-center justify-between gap-4 px-6 py-3">
			<h2 className="min-w-0 truncate font-medium text-[13px] text-[var(--ink-90)]">
				{label}
			</h2>
			<div ref={setRail} className="flex shrink-0 items-center" />
		</div>
	);
}

/** A module the workspace has on that this dialog can configure. */
export type ConfigurableModule = {
	id: string;
	name: string;
	/**
	 * ⚠️ `unknown`, because that is what the context type says. Each module's
	 * shape is its own and the client has no schema for it — the form reads by
	 * path and the API validates on write, which is the only place it can be
	 * checked properly anyway.
	 */
	settings?: unknown;
};
