export const SUPPORTED_FIRST_ACTION_IDS = [
	"client-records:create",
	"products-services:create",
	"files:upload",
	"quotes-estimates:create",
	"projects-tasks:create",
	"invoicing:create",
	"bookings:create",
	"orders:create",
	"time-tracking:create",
	"inventory:adjust",
	"contracts-esign:create",
	"payments:record",
	"fulfillment:create",
	"shipping:create",
] as const;

export type SupportedFirstActionId =
	(typeof SUPPORTED_FIRST_ACTION_IDS)[number];

export type FirstActionCompletion = {
	id: SupportedFirstActionId;
	completed: boolean;
};

type CompletionDetector = (workspaceId: string) => Promise<boolean>;

export type FirstActionCompletionDetectors = Readonly<
	Record<SupportedFirstActionId, CompletionDetector>
>;

const supportedFirstActionIds = new Set<string>(SUPPORTED_FIRST_ACTION_IDS);

function isSupportedFirstActionId(id: string): id is SupportedFirstActionId {
	return supportedFirstActionIds.has(id);
}

export async function resolveFirstActionCompletions(
	workspaceId: string,
	actionIds: readonly string[],
	detectors: FirstActionCompletionDetectors,
): Promise<readonly FirstActionCompletion[]> {
	if (workspaceId.trim().length === 0) {
		throw new Error("FIRST_ACTION_WORKSPACE_REQUIRED");
	}

	const uniqueActionIds: SupportedFirstActionId[] = [];
	const seenActionIds = new Set<string>();
	for (const id of actionIds) {
		if (!isSupportedFirstActionId(id)) {
			throw new Error(`FIRST_ACTION_COMPLETION_UNSUPPORTED:${id}`);
		}
		if (!seenActionIds.has(id)) {
			seenActionIds.add(id);
			uniqueActionIds.push(id);
		}
	}

	return Promise.all(
		uniqueActionIds.map(async (id) => ({
			id,
			completed: await detectors[id](workspaceId),
		})),
	);
}
