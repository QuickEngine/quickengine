export type JobName =
	| "email.send"
	| "user.onboarded"
	| "app.provisioned"
	| "search.index"
	| "storage.cleanup";

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

// Inngest client, its durable functions, and the env-based provider selector. Kept
// below the in-memory queue so the runtime re-export cycle resolves cleanly.
export {
	createInngestJobQueue,
	inngest,
	inngestFunctions,
} from "./inngest";
export { getJobQueue, resetJobQueueForTests } from "./queue";
