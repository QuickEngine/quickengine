import type { QuickEngineAppId, QuickEngineUser } from "@quickengine/types";

export type AnalyticsEventName =
	| "auth.signed_up"
	| "auth.signed_in"
	| "app.opened"
	| "app.created"
	| "onboarding.completed";

export type AnalyticsEvent = {
	name: AnalyticsEventName;
	appId: QuickEngineAppId;
	userId?: QuickEngineUser["id"];
	properties?: Record<string, unknown>;
	timestamp?: Date;
};

export type AnalyticsProvider = {
	track(event: AnalyticsEvent): Promise<void>;
	identify(user: QuickEngineUser): Promise<void>;
};

export const createNoopAnalyticsProvider = (): AnalyticsProvider => ({
	async track() {},
	async identify() {},
});
