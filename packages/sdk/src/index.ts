import type { QuickEngineApiResult, QuickEngineApp } from "@quickengine/types";

export type QuickEngineClientOptions = {
	baseUrl: string;
	apiKey?: string;
	fetcher?: typeof fetch;
};

export class QuickEngineClient {
	readonly baseUrl: string;
	readonly apiKey?: string;
	readonly fetcher: typeof fetch;

	constructor(options: QuickEngineClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.apiKey = options.apiKey;
		this.fetcher = options.fetcher ?? fetch;
	}

	async listApps(): Promise<QuickEngineApiResult<QuickEngineApp[]>> {
		return this.request<QuickEngineApp[]>("/api/apps");
	}

	private async request<TData>(
		path: string,
		init?: RequestInit,
	): Promise<QuickEngineApiResult<TData>> {
		const response = await this.fetcher(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
				...init?.headers,
			},
		});

		if (!response.ok) {
			return {
				ok: false,
				error: {
					code: "quickengine_api_error",
					message: response.statusText,
					status: response.status,
				},
			};
		}

		return { ok: true, data: (await response.json()) as TData };
	}
}

export const createQuickEngineClient = (options: QuickEngineClientOptions) =>
	new QuickEngineClient(options);
