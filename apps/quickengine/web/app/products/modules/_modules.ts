// PLACEHOLDER — module catalog. Shared by the modules directory and the dynamic
// /products/modules/[module] pages. Copy is provisional.
export type ModuleDef = {
	slug: string;
	name: string;
	tagline: string;
	description: string;
	capabilities: string[];
	code?: string;
};

export const MODULES: ModuleDef[] = [
	{
		slug: "auth",
		name: "Auth",
		tagline: "Accounts, done.",
		description:
			"Sessions, social login, passkeys, and 2FA out of the box — the identity layer every app needs, without building it.",
		capabilities: [
			"Email/password + Google & GitHub",
			"Passkeys (WebAuthn)",
			"Two-factor (TOTP) + recovery codes",
			"Sessions and bearer tokens",
			"SSO / SAML on Enterprise",
		],
		code: `await qe.auth.signUp({ email, password });`,
	},
	{
		slug: "billing",
		name: "Billing",
		tagline: "Get paid.",
		description:
			"Subscriptions, metered usage, and invoices on Stripe — checkout to renewal, handled.",
		capabilities: [
			"Plans and tiers",
			"Usage metering",
			"Checkout + customer portal",
			"Invoices and dunning",
		],
		code: `await qe.billing.checkout({ plan: "pro" });`,
	},
	{
		slug: "storage",
		name: "Storage",
		tagline: "Files and media.",
		description:
			"Upload, access-control, and serve files and media, CDN-backed, without standing up a bucket.",
		capabilities: [
			"Direct uploads",
			"Access control",
			"CDN delivery",
			"Image transforms",
		],
		code: `const file = await qe.storage.upload(blob);`,
	},
	{
		slug: "search",
		name: "Search",
		tagline: "Find anything.",
		description:
			"Instant, typo-tolerant search across your data — index once and query fast.",
		capabilities: [
			"Index any collection",
			"Typo tolerance",
			"Faceted filters",
			"Custom ranking",
		],
		code: `const hits = await qe.search.query("blue mug");`,
	},
	{
		slug: "jobs",
		name: "Jobs",
		tagline: "Work in the background.",
		description:
			"Background jobs and schedules that just run — queues, cron, and retries managed for you.",
		capabilities: ["Queues", "Cron schedules", "Automatic retries", "Fan-out"],
		code: `await qe.jobs.schedule("nightly-report", { cron: "0 2 * * *" });`,
	},
	{
		slug: "realtime",
		name: "Realtime",
		tagline: "Live, everywhere.",
		description:
			"Presence and live updates over one connection — collaborative UIs without the plumbing.",
		capabilities: ["Presence", "Channels", "Broadcast", "Live queries"],
		code: `qe.realtime.channel("orders").subscribe(onUpdate);`,
	},
	{
		slug: "analytics",
		name: "Analytics",
		tagline: "Know what's happening.",
		description:
			"Track events and answer product questions without standing up a warehouse.",
		capabilities: ["Event tracking", "Funnels", "Dashboards", "Exports"],
		code: `qe.analytics.track("workspace_created", { type });`,
	},
	{
		slug: "webhooks",
		name: "Webhooks",
		tagline: "React to everything.",
		description:
			"Reliable, signed, retried event delivery to your own systems — never miss an event.",
		capabilities: [
			"Event subscriptions",
			"Retries with backoff",
			"Signed payloads",
			"Delivery logs",
		],
		code: `await qe.webhooks.create({ url, events: ["invoice.paid"] });`,
	},
	{
		slug: "email",
		name: "Email",
		tagline: "Send transactional mail.",
		description:
			"Transactional email and templates that actually land — deliverability handled.",
		capabilities: [
			"Templates",
			"Deliverability",
			"Open/click events",
			"Suppression lists",
		],
		code: `await qe.email.send({ to, template: "welcome" });`,
	},
];

export const getModule = (slug: string) =>
	MODULES.find((module) => module.slug === slug);
