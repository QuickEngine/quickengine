// QuickEngine is the account layer; QuickDash is the single flagship product.
// Former standalone apps (QuickFlow, QuickTools, and the utility apps) now live
// as modules inside QuickDash rather than as their own apps.
export type QuickEngineAppId = "quickengine" | "quickdash";

export type QuickEngineAppSurface = "web" | "admin";

export type QuickEngineAppStatus =
	| "planned"
	| "scaffolded"
	| "building"
	| "beta"
	| "live"
	| "paused";

export type QuickEngineUserRole = "owner" | "admin" | "member";

export type QuickEngineId = string;

export type QuickEngineTimestamp = string;

export type QuickEngineApp = {
	id: QuickEngineAppId;
	name: string;
	category: string;
	status: QuickEngineAppStatus;
	publicUrl?: string;
	adminUrl?: string;
};

export type QuickEngineUser = {
	id: QuickEngineId;
	name: string;
	email: string;
	image?: string | null;
	role: QuickEngineUserRole;
};

export type QuickEngineApiError = {
	code: string;
	message: string;
	status: number;
};

export type QuickEngineApiResult<TData> =
	| { ok: true; data: TData }
	| { ok: false; error: QuickEngineApiError };
