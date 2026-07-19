import { createInMemoryJobQueue, type JobQueue } from "./index";
import { createInngestJobQueue } from "./inngest";

// The process-wide job queue. Inngest when an event key is configured (staging/prod),
// otherwise the in-memory queue so local dev and tests run entirely offline. This is
// the single place provider selection lives — callers only ever see `JobQueue`.
let queue: JobQueue | undefined;

export function getJobQueue(): JobQueue {
	if (!queue) {
		queue = process.env.INNGEST_EVENT_KEY
			? createInngestJobQueue()
			: createInMemoryJobQueue();
	}
	return queue;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing
// the environment.
export function resetJobQueueForTests(): void {
	queue = undefined;
}
