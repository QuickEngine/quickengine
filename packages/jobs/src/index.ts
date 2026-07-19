export type JobName =
	| "email.send"
	| "user.onboarded"
	| "app.provisioned"
	| "search.index"
	| "storage.cleanup"
	// Durable fan-out of a committed domain event; the consumer routes it to
	// audit / search / notifications. Enqueued by the event bus, keyed on event id.
	| "event.dispatch";

export type JobPayload = Record<string, unknown>;

export type EnqueueJobInput<TPayload extends JobPayload = JobPayload> = {
	name: JobName;
	payload: TPayload;
	runAt?: Date;
	idempotencyKey?: string;
};

export type EnqueueJobResult = {
	id: string;
	name: JobName;
};

export type JobQueue = {
	enqueue<TPayload extends JobPayload>(
		input: EnqueueJobInput<TPayload>,
	): Promise<EnqueueJobResult>;
};

export const createInMemoryJobQueue = (): JobQueue => ({
	async enqueue(input) {
		return {
			id: input.idempotencyKey ?? `local-job:${input.name}`,
			name: input.name,
		};
	},
});
