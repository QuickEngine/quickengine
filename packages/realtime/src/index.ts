export type RealtimeChannel = string;

export type RealtimeEvent<TPayload extends Record<string, unknown>> = {
	channel: RealtimeChannel;
	name: string;
	payload: TPayload;
};

export type RealtimeProvider = {
	publish<TPayload extends Record<string, unknown>>(
		event: RealtimeEvent<TPayload>,
	): Promise<void>;
};

export const createNoopRealtimeProvider = (): RealtimeProvider => ({
	async publish() {},
});
