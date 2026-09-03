import type { Field } from "./module-fields";

/**
 * The workspace settings that belong to no single module.
 *
 * 🔑 A page is one or more BLOCKS, each writing one group.
 *
 * The groups are how the API stores and validates settings; the blocks are how
 * a person looks for them. Those are not the same shape — "tax" is its own
 * schema because it validates on its own, but nobody goes looking for tax
 * anywhere other than checkout. Splitting one page per group produced eleven
 * pages, five of which held three switches.
 *
 * ⚠️ Every `path` must exist in that block's group schema. The API parses the
 * group on write, so a typo is a 400 rather than a silent no-op.
 */
export type Block = {
	/** The group in `workspaceSettingsSchema` this block writes. */
	group: string;
	/** Shown above the block when a page has more than one. */
	title?: string;
	blurb?: string;
	fields: readonly Field[];
};

export type WorkspaceSection = {
	blurb: string;
	blocks: readonly Block[];
};

export const WORKSPACE_SETTINGS: Readonly<Record<string, WorkspaceSection>> = {
	checkout: {
		blurb:
			"What a customer has to give you at checkout, what an order has to be worth, and how tax is shown.",
		blocks: [
			{
				group: "checkout",
				title: "What you ask for",
				blurb:
					"What a customer has to give you, and what an order has to be worth.",
				fields: [
					{
						kind: "toggle",
						path: "allowGuestOrders",
						label: "Allow orders without an account",
						hint: "Off means somebody has to sign up before they can buy.",
					},
					{
						kind: "toggle",
						path: "requirePhone",
						label: "Require a phone number",
					},
					{
						kind: "toggle",
						path: "requireTermsAccepted",
						label: "Must accept terms before ordering",
					},
					{
						kind: "toggle",
						path: "requireAgeConfirmation",
						label: "Confirm age at checkout",
					},
					{
						kind: "toggle",
						path: "separateBillingAddress",
						label: "Collect a separate billing address",
					},
					{
						kind: "money",
						path: "minimumOrderCents",
						label: "Minimum order",
						hint: "Zero means no minimum.",
					},
					{
						kind: "money",
						path: "maximumOrderCents",
						label: "Maximum order",
						hint: "Zero means no maximum.",
					},
				],
			},
			{
				group: "tax",
				title: "Tax",
				blurb: "How tax is shown and what it applies to. Rates live on Orders.",
				fields: [
					{
						kind: "toggle",
						path: "pricesIncludeTax",
						label: "Prices already include tax",
						hint: "Normal outside North America.",
					},
					{
						kind: "toggle",
						path: "chargeTaxOnShipping",
						label: "Charge tax on delivery",
					},
					{
						kind: "toggle",
						path: "showTaxSeparately",
						label: "Show tax as its own line",
					},
					{
						kind: "text",
						path: "dutiesDisclaimer",
						label: "Import duties note",
						hint: "Shown to international buyers. Leave blank to say nothing.",
						max: 500,
					},
				],
			},
		],
	},

	returns: {
		blurb: "How long somebody has, who pays, and what happens to the stock.",
		blocks: [
			{
				group: "returns",
				blurb: "",
				fields: [
					{
						kind: "number",
						path: "windowDays",
						label: "Returns accepted for",
						min: 0,
						max: 365,
						suffix: "days",
					},
					{
						kind: "toggle",
						path: "requireReason",
						label: "A reason is required",
					},
					{
						kind: "toggle",
						path: "autoApprove",
						label: "Approve requests automatically",
					},
					{
						kind: "toggle",
						path: "allowExchanges",
						label: "Allow an exchange instead of a refund",
					},
					{
						kind: "toggle",
						path: "restockOnRefund",
						label: "Put stock back when a refund is issued",
						hint: "Off means a refunded item stays counted as sold.",
					},
					{
						kind: "select",
						path: "returnShippingPaidBy",
						label: "Return postage paid by",
						options: [
							{ value: "customer", label: "The customer" },
							{ value: "business", label: "You" },
						],
					},
				],
			},
		],
	},

	discounts: {
		blurb: "Whether codes can be combined, and how they are offered.",
		blocks: [
			{
				group: "discounts",
				blurb: "",
				fields: [
					{
						kind: "toggle",
						path: "allowStacking",
						label: "Allow more than one code per order",
					},
					{
						kind: "number",
						path: "maxPerOrder",
						label: "At most",
						min: 1,
						max: 20,
						suffix: "codes per order",
					},
					{
						kind: "toggle",
						path: "autoApplyEligible",
						label: "Apply eligible promotions automatically",
					},
					{
						kind: "toggle",
						path: "showCodeFieldAtCheckout",
						label: "Show a code box at checkout",
						hint: "Off hides it, some shops find it prompts people to go looking.",
					},
				],
			},
		],
	},

	accounts: {
		blurb:
			"Whether a shopper can have an account, how long you keep what you hold about them, and what they may ask for.",
		blocks: [
			{
				group: "accounts",
				title: "Customer accounts",
				blurb:
					"Whether a shopper can have an account, and what it takes to get one.",
				fields: [
					{
						kind: "toggle",
						path: "allowRegistration",
						label: "Customers can create an account",
					},
					{
						kind: "toggle",
						path: "requireVerifiedEmail",
						label: "Verify email before the first purchase",
					},
					{
						kind: "toggle",
						path: "allowSelfDeletion",
						label: "Customers can delete their own account",
					},
				],
			},
			{
				group: "retention",
				title: "Keeping and erasing data",
				blurb: "How long things are kept, and what a customer may ask for.",
				fields: [
					{
						kind: "number",
						path: "orderHistoryDays",
						label: "Keep order history for",
						min: 0,
						max: 3650,
						suffix: "days",
						hint: "Zero means forever. Business records usually should be.",
					},
					{
						kind: "number",
						path: "activityLogDays",
						label: "Keep the activity log for",
						min: 0,
						max: 3650,
						suffix: "days",
					},
					{
						kind: "toggle",
						path: "cookieConsent",
						label: "Show a cookie notice",
					},
					{
						kind: "toggle",
						path: "allowDataExportRequests",
						label: "Customers can request their data",
					},
				],
			},
		],
	},

	email: {
		blurb: "What reaches your customers automatically, and what reaches you.",
		blocks: [
			{
				group: "customerEmail",
				title: "Your customers get",
				blurb: "Which messages a customer gets automatically.",
				fields: [
					{
						kind: "toggle",
						path: "orderStatusChanges",
						label: "When an order changes status",
					},
					{
						kind: "toggle",
						path: "shipmentTracking",
						label: "When something ships, with tracking",
					},
					{
						kind: "toggle",
						path: "deliveryConfirmation",
						label: "When it is delivered",
					},
					{
						kind: "toggle",
						path: "reviewRequest",
						label: "Ask for a review afterwards",
					},
					{
						kind: "toggle",
						path: "backInStock",
						label: "When a saved item is back in stock",
					},
					{
						kind: "toggle",
						path: "marketing",
						label: "Promotional email",
						hint: "Only to people who agreed to it.",
					},
				],
			},
			{
				group: "notifications",
				title: "You get",
				blurb: "Which events reach you, rather than your customers.",
				fields: [
					{ kind: "toggle", path: "newOrder", label: "A new order" },
					{ kind: "toggle", path: "lowStock", label: "Stock running low" },
					{ kind: "toggle", path: "paymentFailure", label: "A payment failed" },
					{
						kind: "toggle",
						path: "newReview",
						label: "A review was submitted",
					},
					{
						kind: "toggle",
						path: "dailySummary",
						label: "A summary of the day",
					},
				],
			},
		],
	},

	reviews: {
		blurb:
			"Who can leave one, and whether you see it before your customers do.",
		blocks: [
			{
				group: "reviews",
				blurb: "",
				fields: [
					{
						kind: "toggle",
						path: "autoPublish",
						label: "Publish without checking them first",
						hint: "On means a review reaches your shop the moment it is written.",
					},
					{
						kind: "toggle",
						path: "verifiedBuyersOnly",
						label: "Only people who bought it",
					},
					{ kind: "toggle", path: "allowImages", label: "Allow photographs" },
					{
						kind: "number",
						path: "requestAfterDays",
						label: "Ask for one",
						min: 0,
						max: 180,
						suffix: "days after delivery",
					},
				],
			},
		],
	},

	branding: {
		blurb: "",
		blocks: [
			{
				group: "legal",
				title: "Policy pages",
				blurb:
					"Anything left blank is hidden from your footer rather than linked to nothing.",
				fields: [
					{
						kind: "text",
						path: "privacy",
						label: "Privacy policy",
						placeholder: "/privacy",
						max: 300,
					},
					{
						kind: "text",
						path: "terms",
						label: "Terms",
						placeholder: "/terms",
						max: 300,
					},
					{
						kind: "text",
						path: "refunds",
						label: "Refund policy",
						placeholder: "/refund-policy",
						max: 300,
					},
					{
						kind: "text",
						path: "shipping",
						label: "Delivery",
						placeholder: "/shipping",
						max: 300,
					},
					{
						kind: "text",
						path: "returns",
						label: "Returns",
						placeholder: "/returns",
						max: 300,
					},
					{
						kind: "text",
						path: "accessibility",
						label: "Accessibility",
						placeholder: "/accessibility",
						max: 300,
					},
				],
			},
			{
				group: "social",
				title: "Social profiles",
				blurb: "Blank hides the link rather than pointing it nowhere.",
				fields: [
					{
						kind: "text",
						path: "instagram",
						label: "Instagram",
						placeholder: "https://instagram.com/…",
						max: 300,
					},
					{
						kind: "text",
						path: "x",
						label: "X",
						placeholder: "https://x.com/…",
						max: 300,
					},
					{
						kind: "text",
						path: "facebook",
						label: "Facebook",
						placeholder: "https://facebook.com/…",
						max: 300,
					},
					{
						kind: "text",
						path: "tiktok",
						label: "TikTok",
						placeholder: "https://tiktok.com/@…",
						max: 300,
					},
					{
						kind: "text",
						path: "youtube",
						label: "YouTube",
						placeholder: "https://youtube.com/…",
						max: 300,
					},
					{
						kind: "text",
						path: "linkedin",
						label: "LinkedIn",
						placeholder: "https://linkedin.com/company/…",
						max: 300,
					},
					{
						kind: "text",
						path: "pinterest",
						label: "Pinterest",
						placeholder: "https://pinterest.com/…",
						max: 300,
					},
					{
						kind: "text",
						path: "discord",
						label: "Discord",
						placeholder: "https://discord.gg/…",
						max: 300,
					},
				],
			},
		],
	},
};
