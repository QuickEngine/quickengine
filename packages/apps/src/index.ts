import type {
	QuickEngineApp,
	QuickEngineAppId,
	QuickEngineAppStatus,
} from "@quickengine/types";

export type QuickEngineAppPriority =
	| "ship-it"
	| "build-it"
	| "planned"
	| "parked";

export type QuickEngineSuiteApp = QuickEngineApp & {
	priority: QuickEngineAppPriority;
	targetUser: string;
	summary: string;
	v1Done: string[];
};

export const quickEngineApps = [
	{
		id: "quickengine",
		name: "QuickEngine",
		category: "Company / Account",
		status: "scaffolded",
		priority: "ship-it",
		publicUrl: "http://localhost:3000",
		adminUrl: "http://localhost:3001",
		targetUser: "QuickEngine users managing one account across the suite.",
		summary: "The company account hub, app launcher, and shared suite shell.",
		v1Done: [
			"Account shell is usable",
			"App launcher shows the full suite roster",
			"Shared auth routes are available",
		],
	},
	{
		id: "quickdash",
		name: "QuickDash",
		category: "Business / E-Commerce",
		status: "building",
		priority: "ship-it",
		publicUrl: "http://localhost:3010",
		adminUrl: "http://localhost:3011",
		targetUser:
			"Small business owners and freelancers who want Shopify-level power without Shopify-level cost or app-store lock-in.",
		summary: "Bring-your-own-frontend e-commerce dashboard.",
		v1Done: [
			"Auth flow fully polished",
			"Onboarding rebuilt",
			"Billing re-integrated later",
			"Marketing page live",
		],
	},
	{
		id: "quickflow",
		name: "QuickFlow",
		category: "Finance / Budgeting",
		status: "scaffolded",
		priority: "ship-it",
		publicUrl: "http://localhost:3020",
		adminUrl: "http://localhost:3021",
		targetUser:
			"Individuals and freelancers who want a real budgeting tool without spreadsheets or overpriced finance apps.",
		summary:
			"Budgeting, expenses, savings goals, debt payoff, net worth, and recurring bills.",
		v1Done: [
			"Core budgeting flow works end to end",
			"At least three calculators live",
			"Auth and account inherited from QuickEngine",
			"UI quality matches QuickDash",
		],
	},
	{
		id: "pdf-tools",
		name: "PDF Tools",
		category: "Document Utilities",
		status: "planned",
		priority: "build-it",
		targetUser: "Anyone needing to merge, split, compress, or convert PDFs.",
		summary:
			"Merge, split, compress, rotate, watermark, unlock, and convert PDFs.",
		v1Done: [
			"Merge, split, and compress functional",
			"PDF to Word and Word to PDF working",
			"SEO landing pages per tool",
		],
	},
	{
		id: "image-tools",
		name: "Image Tools",
		category: "Media Tools",
		status: "planned",
		priority: "build-it",
		targetUser:
			"Creators, marketers, and everyday users needing quick image edits.",
		summary: "Compress, resize, crop, convert, and remove image backgrounds.",
		v1Done: [
			"Compress and resize with quality presets",
			"JPG, PNG, WebP, HEIC conversion",
			"Background removal functional",
		],
	},
	{
		id: "web-tools",
		name: "Web Tools",
		category: "Internet Utilities",
		status: "planned",
		priority: "planned",
		targetUser:
			"Developers, marketers, and everyday users needing QR, link, and lookup tools.",
		summary:
			"QR generator, URL shortener, password generator, DNS/WHOIS lookups, and meta tag generator.",
		v1Done: [
			"QR generator and URL shortener live",
			"Password generator and strength checker live",
			"DNS, WHOIS, and IP lookups functional",
		],
	},
	{
		id: "text-tools",
		name: "Text Tools",
		category: "Content Utilities",
		status: "planned",
		priority: "planned",
		targetUser:
			"Writers, students, and developers needing quick text manipulation tools.",
		summary:
			"Word counter, case converter, formatters, diff checker, and markdown conversion.",
		v1Done: [
			"Word and character counter live",
			"Case converter live",
			"Formatters and diff checker functional",
		],
	},
	{
		id: "dev-tools",
		name: "Dev Tools",
		category: "Developer Utilities",
		status: "planned",
		priority: "planned",
		targetUser:
			"Developers needing quick formatting, testing, and generation tools.",
		summary:
			"JSON formatter, regex tester, JWT decoder, UUID generator, SQL formatter, and API tester.",
		v1Done: [
			"JSON, SQL, CSS, and HTML formatters functional",
			"Regex tester and JWT decoder live",
			"UUID and fake data generators functional",
		],
	},
	{
		id: "converters",
		name: "Converters",
		category: "Conversion Utilities",
		status: "planned",
		priority: "planned",
		targetUser:
			"Anyone needing quick unit, currency, or measurement conversions.",
		summary:
			"Length, weight, temperature, currency, time zone, cooking, and measurement converters.",
		v1Done: [
			"Core unit converters live",
			"Currency converter with live rates functional",
			"Time zone converter functional",
		],
	},
	{
		id: "business-tools",
		name: "Business Tools",
		category: "Business Utilities",
		status: "planned",
		priority: "planned",
		targetUser:
			"Freelancers and small business owners needing invoices, quotes, and quick legal documents.",
		summary:
			"Invoice generator, receipt generator, fee calculators, and legal document generators.",
		v1Done: [
			"Invoice and receipt generator functional",
			"Platform fee calculators live",
			"Basic legal doc generators functional",
		],
	},
	{
		id: "productivity",
		name: "Productivity",
		category: "Productivity Utilities",
		status: "planned",
		priority: "planned",
		targetUser:
			"Anyone wanting lightweight productivity tools without a bloated workspace app.",
		summary: "Pomodoro timer, habit tracker, kanban board, and planners.",
		v1Done: [
			"Pomodoro and habit tracker functional",
			"Basic kanban board functional",
			"Daily planner functional",
		],
	},
	{
		id: "ai-tools",
		name: "AI Tools",
		category: "AI Utilities",
		status: "paused",
		priority: "parked",
		targetUser:
			"Anyone wanting quick AI-assisted writing, summarization, or planning.",
		summary:
			"Email writer, grammar fixer, summarizer, resume builder, and meal planner.",
		v1Done: ["Revisit once core suite is live and API costs are modelled"],
	},
	{
		id: "health",
		name: "Health",
		category: "Health Utilities",
		status: "paused",
		priority: "parked",
		targetUser:
			"Anyone wanting quick health and fitness calculators without a full fitness app subscription.",
		summary:
			"BMI, TDEE, macros, sleep, fitness, and meal planning calculators.",
		v1Done: ["Revisit once core suite is live"],
	},
	{
		id: "video-audio",
		name: "Video & Audio",
		category: "Media Utilities",
		status: "paused",
		priority: "parked",
		targetUser:
			"Creators needing quick video/audio compression, conversion, or subtitle generation.",
		summary:
			"Compress, convert, trim, and subtitle generation for video and audio.",
		v1Done: ["Revisit after processing costs and storage are planned"],
	},
] as const satisfies QuickEngineSuiteApp[];

export const getQuickEngineApp = (id: QuickEngineAppId) =>
	quickEngineApps.find((app) => app.id === id);

export const getQuickEngineAppsByStatus = (status: QuickEngineAppStatus) =>
	quickEngineApps.filter((app) => app.status === status);

export const getQuickEngineAppsByPriority = (
	priority: QuickEngineAppPriority,
) => quickEngineApps.filter((app) => app.priority === priority);
