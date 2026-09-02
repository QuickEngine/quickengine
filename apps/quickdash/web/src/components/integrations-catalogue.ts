/**
 * Everything a QuickDash workspace should be able to plug into.
 *
 * 🔑 Written down before any of it is built, for the same reason the settings
 * sections were: the shape of the whole thing can be argued about while it is
 * still cheap, and an operator can see what is coming rather than wondering
 * whether it exists.
 *
 * ⚠️ Grouped by the JOB, not by the vendor. Somebody looking to get orders into
 * their accounts does not know or care whether that is QuickBooks or Xero until
 * they see both under "Accounting".
 *
 * 🔴 Nothing here is connectable yet, and every row says so. The one real
 * integration — payment providers — is read from `/account/integrations` and
 * shown above this list, because it is the only one that already works.
 */

export type IntegrationEntry = {
	id: string;
	name: string;
	/** What it does FOR the business, not what the vendor calls itself. */
	detail: string;
};

export type IntegrationGroup = {
	group: string;
	/** A phosphor icon name resolved by the panel. */
	icon: string;
	items: readonly IntegrationEntry[];
};

export const INTEGRATIONS: readonly IntegrationGroup[] = [
	{
		group: "Email",
		icon: "envelope",
		items: [
			{
				id: "gmail",
				name: "Gmail",
				detail: "Read and send from your own inbox",
			},
			{
				id: "outlook",
				name: "Outlook",
				detail: "Read and send from Microsoft 365",
			},
			{
				id: "resend",
				name: "Resend",
				detail: "Send customer mail from your domain",
			},
			{
				id: "postmark",
				name: "Postmark",
				detail: "Transactional mail with delivery receipts",
			},
		],
	},
	{
		group: "Marketing",
		icon: "megaphone",
		items: [
			{
				id: "klaviyo",
				name: "Klaviyo",
				detail: "Abandoned cart and post-purchase flows",
			},
			{
				id: "mailchimp",
				name: "Mailchimp",
				detail: "Newsletters and audience lists",
			},
			{
				id: "twilio",
				name: "Twilio",
				detail: "Order and delivery updates by text",
			},
			{
				id: "meta-ads",
				name: "Meta Ads",
				detail: "Conversion tracking for Facebook and Instagram",
			},
			{
				id: "google-ads",
				name: "Google Ads",
				detail: "Conversion tracking for search and shopping",
			},
			{
				id: "tiktok-ads",
				name: "TikTok Ads",
				detail: "Conversion tracking and retargeting",
			},
		],
	},
	{
		group: "Chat and support",
		icon: "chat",
		items: [
			{
				id: "slack",
				name: "Slack",
				detail: "Post orders and alerts to a channel",
			},
			{
				id: "discord",
				name: "Discord",
				detail: "Post orders and alerts to a server",
			},
			{
				id: "intercom",
				name: "Intercom",
				detail: "Customer conversations beside the record",
			},
			{ id: "crisp", name: "Crisp", detail: "Live chat on your own site" },
			{
				id: "whatsapp",
				name: "WhatsApp Business",
				detail: "Reach customers where they already are",
			},
		],
	},
	{
		group: "Selling elsewhere",
		icon: "storefront",
		items: [
			{
				id: "shopify",
				name: "Shopify",
				detail: "Hand an order to a supplier's shop",
			},
			{
				id: "woocommerce",
				name: "WooCommerce",
				detail: "Sync a WordPress catalogue",
			},
			{ id: "etsy", name: "Etsy", detail: "One stock count across both shops" },
			{
				id: "amazon",
				name: "Amazon",
				detail: "Orders and inventory from Seller Central",
			},
			{ id: "ebay", name: "eBay", detail: "Listings and orders in one place" },
			{
				id: "square-pos",
				name: "Square POS",
				detail: "Counter sales against the same stock",
			},
			{
				id: "tiktok-shop",
				name: "TikTok Shop",
				detail: "Sell from the feed, fulfil from here",
			},
		],
	},
	{
		group: "Shipping",
		icon: "truck",
		items: [
			{ id: "shippo", name: "Shippo", detail: "Live rates and printed labels" },
			{
				id: "easypost",
				name: "EasyPost",
				detail: "Rates, labels and tracking across carriers",
			},
			{
				id: "shipstation",
				name: "ShipStation",
				detail: "Pick, pack and batch fulfilment",
			},
			{
				id: "canada-post",
				name: "Canada Post",
				detail: "Rates and labels, direct",
			},
			{ id: "ups", name: "UPS", detail: "Rates and labels, direct" },
			{ id: "fedex", name: "FedEx", detail: "Rates and labels, direct" },
			{
				id: "dhl",
				name: "DHL",
				detail: "International rates and customs paperwork",
			},
		],
	},
	{
		group: "Accounting and tax",
		icon: "calculator",
		items: [
			{
				id: "quickbooks",
				name: "QuickBooks",
				detail: "Orders and payouts into your books",
			},
			{
				id: "xero",
				name: "Xero",
				detail: "Orders and payouts into your books",
			},
			{ id: "wave", name: "Wave", detail: "Free bookkeeping for small shops" },
			{
				id: "avalara",
				name: "Avalara",
				detail: "Tax worked out per jurisdiction",
			},
			{ id: "taxjar", name: "TaxJar", detail: "Sales tax rates and filing" },
		],
	},
	{
		group: "Files and notes",
		icon: "cloud",
		items: [
			{
				id: "google-drive",
				name: "Google Drive",
				detail: "Attach files without uploading them twice",
			},
			{
				id: "dropbox",
				name: "Dropbox",
				detail: "Attach files from where they already live",
			},
			{
				id: "onedrive",
				name: "OneDrive",
				detail: "Attach files from Microsoft 365",
			},
			{
				id: "notion",
				name: "Notion",
				detail: "Keep a record's notes where your team writes",
			},
		],
	},
	{
		group: "Calendar",
		icon: "calendar",
		items: [
			{
				id: "google-calendar",
				name: "Google Calendar",
				detail: "Bookings on your real calendar",
			},
			{
				id: "outlook-calendar",
				name: "Outlook Calendar",
				detail: "Bookings on your real calendar",
			},
			{
				id: "cal-com",
				name: "Cal.com",
				detail: "Let customers pick a time you actually have",
			},
		],
	},
	{
		group: "Analytics",
		icon: "chart",
		items: [
			{
				id: "google-analytics",
				name: "Google Analytics",
				detail: "Where your traffic comes from",
			},
			{ id: "posthog", name: "PostHog", detail: "What people do on your site" },
			{
				id: "plausible",
				name: "Plausible",
				detail: "Traffic without cookies or consent banners",
			},
			{
				id: "hotjar",
				name: "Hotjar",
				detail: "Watch where a checkout loses people",
			},
		],
	},
	{
		group: "Customers",
		icon: "address-book",
		items: [
			{
				id: "hubspot",
				name: "HubSpot",
				detail: "Deals and contacts beside their orders",
			},
			{
				id: "salesforce",
				name: "Salesforce",
				detail: "Enterprise CRM, two-way",
			},
			{
				id: "pipedrive",
				name: "Pipedrive",
				detail: "A pipeline for a small sales team",
			},
			{
				id: "trustpilot",
				name: "Trustpilot",
				detail: "Ask for reviews, show them on your site",
			},
			{
				id: "judge-me",
				name: "Judge.me",
				detail: "Product reviews with photographs",
			},
		],
	},
	{
		group: "Site",
		icon: "globe",
		items: [
			{
				id: "google-maps",
				name: "Google Maps",
				detail: "Address autocomplete at checkout",
			},
			{
				id: "algolia",
				name: "Algolia",
				detail: "Instant search on your storefront",
			},
			{
				id: "cloudinary",
				name: "Cloudinary",
				detail: "Images resized and served fast",
			},
			{
				id: "turnstile",
				name: "Cloudflare Turnstile",
				detail: "Stop bots without a puzzle",
			},
		],
	},
	{
		group: "Automation",
		icon: "lightning",
		items: [
			{
				id: "zapier",
				name: "Zapier",
				detail: "Send events anywhere without code",
			},
			{
				id: "make",
				name: "Make",
				detail: "Visual workflows across your tools",
			},
			{ id: "n8n", name: "n8n", detail: "Self-hosted automation" },
		],
	},
	{
		group: "Taking money",
		icon: "card",
		items: [
			{
				id: "square",
				name: "Square",
				detail: "Card payments online and at a counter",
			},
			{
				id: "adyen",
				name: "Adyen",
				detail: "One processor across many countries",
			},
			{
				id: "mollie",
				name: "Mollie",
				detail: "European methods like iDEAL and Bancontact",
			},
			{
				id: "klarna",
				name: "Klarna",
				detail: "Let customers pay in instalments",
			},
			{
				id: "afterpay",
				name: "Afterpay",
				detail: "Buy now, pay later at checkout",
			},
			{ id: "affirm", name: "Affirm", detail: "Financing for larger baskets" },
			{
				id: "coinbase-commerce",
				name: "Coinbase Commerce",
				detail: "Accept crypto, settle in currency",
			},
			{ id: "reown", name: "Reown", detail: "Wallet payments across chains" },
			{
				id: "wise",
				name: "Wise",
				detail: "Pay suppliers abroad without the spread",
			},
		],
	},
	{
		group: "Banking",
		icon: "bank",
		items: [
			{
				id: "plaid",
				name: "Plaid",
				detail: "Connect a bank account to verify or pay",
			},
			{
				id: "mercury",
				name: "Mercury",
				detail: "Business banking, balances beside your revenue",
			},
			{
				id: "ramp",
				name: "Ramp",
				detail: "Company cards and spend against your books",
			},
			{
				id: "brex",
				name: "Brex",
				detail: "Cards and expenses for a growing team",
			},
		],
	},
	{
		group: "Making things",
		icon: "package",
		items: [
			{
				id: "printful",
				name: "Printful",
				detail: "Print and ship on demand, no stock held",
			},
			{
				id: "printify",
				name: "Printify",
				detail: "Print on demand across many suppliers",
			},
			{
				id: "gelato",
				name: "Gelato",
				detail: "Print locally, ship shorter distances",
			},
			{
				id: "katana",
				name: "Katana",
				detail: "Track what you make from raw materials",
			},
		],
	},
	{
		group: "Warehousing",
		icon: "warehouse",
		items: [
			{
				id: "shipbob",
				name: "ShipBob",
				detail: "Someone else holds and ships your stock",
			},
			{
				id: "fba",
				name: "Fulfilment by Amazon",
				detail: "Amazon picks, packs and delivers",
			},
			{
				id: "cin7",
				name: "Cin7",
				detail: "One stock count across every channel",
			},
			{
				id: "faire",
				name: "Faire",
				detail: "Buy wholesale from independent brands",
			},
			{
				id: "aliexpress",
				name: "AliExpress",
				detail: "Source and dropship without holding stock",
			},
		],
	},
	{
		group: "Subscriptions and loyalty",
		icon: "repeat",
		items: [
			{
				id: "recharge",
				name: "Recharge",
				detail: "Recurring orders with customer control",
			},
			{
				id: "chargebee",
				name: "Chargebee",
				detail: "Plans, trials and dunning",
			},
			{
				id: "smile-io",
				name: "Smile.io",
				detail: "Points and rewards that bring people back",
			},
			{
				id: "yotpo",
				name: "Yotpo",
				detail: "Reviews, loyalty and referrals together",
			},
			{
				id: "referralcandy",
				name: "ReferralCandy",
				detail: "Pay customers for bringing friends",
			},
		],
	},
	{
		group: "Documents",
		icon: "pen",
		items: [
			{
				id: "docusign",
				name: "DocuSign",
				detail: "Signatures that stand up legally",
			},
			{
				id: "dropbox-sign",
				name: "Dropbox Sign",
				detail: "Simple signing on your own paperwork",
			},
			{
				id: "pandadoc",
				name: "PandaDoc",
				detail: "Proposals and quotes that sign themselves off",
			},
		],
	},
	{
		group: "Your website",
		icon: "browser",
		items: [
			{
				id: "webflow",
				name: "Webflow",
				detail: "Publish pages, sell from QuickDash",
			},
			{
				id: "framer",
				name: "Framer",
				detail: "Design the site, keep the commerce here",
			},
			{
				id: "wordpress",
				name: "WordPress",
				detail: "Keep the blog, move the shop",
			},
			{
				id: "contentful",
				name: "Contentful",
				detail: "Content managed by your team",
			},
			{
				id: "sanity",
				name: "Sanity",
				detail: "Structured content with live preview",
			},
			{ id: "weglot", name: "Weglot", detail: "Your shop in another language" },
		],
	},
	{
		group: "Social",
		icon: "share",
		items: [
			{
				id: "instagram",
				name: "Instagram",
				detail: "Tag products in posts and stories",
			},
			{
				id: "facebook-page",
				name: "Facebook Page",
				detail: "Shop tab and message replies",
			},
			{
				id: "pinterest",
				name: "Pinterest",
				detail: "Product pins that link back",
			},
			{
				id: "youtube",
				name: "YouTube",
				detail: "Shoppable video and channel stats",
			},
			{
				id: "linkedin",
				name: "LinkedIn",
				detail: "For businesses selling to businesses",
			},
			{ id: "x", name: "X", detail: "Post launches and restocks" },
		],
	},
	{
		group: "Phone",
		icon: "phone",
		items: [
			{
				id: "aircall",
				name: "Aircall",
				detail: "Calls logged against the customer",
			},
			{
				id: "ringcentral",
				name: "RingCentral",
				detail: "A business line for a small team",
			},
			{
				id: "twilio-voice",
				name: "Twilio Voice",
				detail: "Call and record programmatically",
			},
		],
	},
	{
		group: "Appointments",
		icon: "clock",
		items: [
			{
				id: "calendly",
				name: "Calendly",
				detail: "Let people book without the email chain",
			},
			{
				id: "acuity",
				name: "Acuity",
				detail: "Scheduling with intake forms and deposits",
			},
		],
	},
	{
		group: "Point of sale",
		icon: "storefront",
		items: [
			{
				id: "clover",
				name: "Clover",
				detail: "Counter sales against the same stock",
			},
			{ id: "toast", name: "Toast", detail: "For food and drink" },
			{
				id: "lightspeed",
				name: "Lightspeed",
				detail: "Retail and restaurant tills",
			},
		],
	},
	{
		group: "People",
		icon: "users",
		items: [
			{ id: "gusto", name: "Gusto", detail: "Payroll for a small team" },
			{
				id: "deel",
				name: "Deel",
				detail: "Pay contractors in other countries",
			},
			{
				id: "rippling",
				name: "Rippling",
				detail: "People, payroll and devices",
			},
		],
	},
	{
		group: "Building it",
		icon: "code",
		items: [
			{
				id: "github",
				name: "GitHub",
				detail: "Your own site's code, deployed on merge",
			},
			{ id: "gitlab", name: "GitLab", detail: "Same, on your own instance" },
			{
				id: "linear",
				name: "Linear",
				detail: "Turn a customer report into an issue",
			},
			{ id: "jira", name: "Jira", detail: "For teams that already live there" },
			{
				id: "sentry",
				name: "Sentry",
				detail: "Know your storefront broke before a customer says so",
			},
			{
				id: "vercel",
				name: "Vercel",
				detail: "Deploy previews of your own site",
			},
			{
				id: "cloudflare",
				name: "Cloudflare",
				detail: "DNS, caching and bot protection",
			},
		],
	},
	{
		group: "Signing in",
		icon: "key",
		items: [
			{
				id: "google-sso",
				name: "Google Workspace",
				detail: "Your team signs in with work accounts",
			},
			{
				id: "microsoft-sso",
				name: "Microsoft Entra",
				detail: "Single sign-on for Microsoft shops",
			},
			{
				id: "okta",
				name: "Okta",
				detail: "Enterprise identity and provisioning",
			},
		],
	},
];
