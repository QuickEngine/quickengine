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

// QuickEngine is the company/account layer; QuickDash is the single flagship
// product. Capabilities once imagined as separate apps (QuickFlow, QuickTools,
// and the utility apps) now ship as modules inside QuickDash, so they are not
// listed here as apps. New business types are new QuickDash workspace recipes,
// not new apps.
export const quickEngineApps = [
	{
		id: "quickengine",
		name: "QuickEngine",
		category: "Company / Account",
		status: "building",
		priority: "ship-it",
		publicUrl: "http://localhost:3000",
		adminUrl: "http://localhost:3001",
		targetUser: "QuickEngine users managing one account across the product.",
		summary:
			"The company front door: marketing, one shared account and auth, billing, and the account hub.",
		v1Done: [
			"Unified auth works end to end (sign up, sign in, OAuth, reset, verify)",
			"Account hub is usable after sign-in",
			"Billing turns a signed-in user into a paid, entitled user",
		],
	},
	{
		id: "quickdash",
		name: "QuickDash",
		category: "Business Backend",
		status: "planned",
		priority: "build-it",
		publicUrl: "http://localhost:3010",
		adminUrl: "http://localhost:3011",
		targetUser:
			"Individuals, freelancers, and small businesses who want a backend that adapts to their business without one-size-fits-all software or a pile of disconnected tools.",
		summary:
			"The flagship: a headless business backend as a service, configured per workspace, reached through a dashboard by default or a custom frontend via API.",
		v1Done: [
			"First workspace type is configurable end to end (self-configured and AI-configured)",
			"Shared modules (invoicing, client records) usable in a workspace",
			"Tier gating enforced per the Business Model tier ladder",
		],
	},
] as const satisfies QuickEngineSuiteApp[];

export const getQuickEngineApp = (id: QuickEngineAppId) =>
	quickEngineApps.find((app) => app.id === id);

export const getQuickEngineAppsByStatus = (status: QuickEngineAppStatus) =>
	quickEngineApps.filter((app) => app.status === status);

export const getQuickEngineAppsByPriority = (
	priority: QuickEngineAppPriority,
) => quickEngineApps.filter((app) => app.priority === priority);
