import { reportProviderSelection } from "@quickengine/provider-health";
import { createInMemoryJobQueue, type JobQueue } from "./index";
import { createInngestJobQueue } from "./inngest";

// The process-wide job queue. Inngest when an event key is configured (staging/prod),
// otherwise the in-memory queue so local dev and tests run entirely offline. This is
// the single place provider selection lives — callers only ever see `JobQueue`.
let queue: JobQueue | undefined;

export function getJobQueue(): JobQueue {
	if (!queue) {
		if (process.env.INNGEST_EVENT_KEY) {
			queue = createInngestJobQueue();
			reportProviderSelection({ provider: "jobs", degraded: false });
		} else {
			queue = createInMemoryJobQueue();
			// The only one of the three fallbacks that loses work rather than
			// withholding a feature: the in-memory queue accepts a job, the function
			// instance is recycled, and the job is simply gone. Outbox dispatch and
			// webhook delivery both run through here.
			reportProviderSelection({
				degraded: true,
				provider: "jobs",
				implementation: "in-memory queue",
				consequence:
					"enqueued jobs are accepted and then lost on cold start, including outbox dispatch and webhook delivery",
				missing: ["INNGEST_EVENT_KEY"],
				severity: "data-loss",
			});
		}
	}
	return queue;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing
// the environment.
export function resetJobQueueForTests(): void {
	queue = undefined;
}
