import type { GuidedActionStepCompletion } from "./guided-action-resolution";

export const SUPPORTED_GUIDED_STEP_IDS = [
	"client-records:create:details",
	"products-services:create:offering",
	"files:upload:file",
	"invoicing:create:draft",
	"invoicing:create:send",
	"payments:record:payment",
	"fulfillment:create:start",
	"fulfillment:create:complete",
	"quotes-estimates:create:draft",
	"quotes-estimates:create:send",
	"projects-tasks:create:project",
	"projects-tasks:create:task",
	"bookings:create:booking",
	"bookings:create:confirm",
	"orders:create:draft",
	"orders:create:confirm",
	"time-tracking:create:entry",
	"time-tracking:create:review",
	"inventory:adjust:stock",
	"contracts-esign:create:draft",
	"contracts-esign:create:send",
	"shipping:create:shipment",
	"shipping:create:dispatch",
] as const;

export type SupportedGuidedStepId = (typeof SUPPORTED_GUIDED_STEP_IDS)[number];
export type GuidedStepCompletionDetectors = Readonly<
	Record<SupportedGuidedStepId, (workspaceId: string) => Promise<boolean>>
>;

export const guidedStatusPolicies = {
	nonDraft: (status: string) => status !== "draft",
	fulfillmentComplete: (status: string) => status === "fulfilled",
	bookingConfirmed: (status: string) =>
		["confirmed", "checked_in", "completed", "no_show"].includes(status),
	orderConfirmed: (status: string) =>
		["confirmed", "processing", "fulfilled"].includes(status),
	timeReviewed: (status: string) => ["approved", "invoiced"].includes(status),
	shipmentDispatched: (status: string) =>
		["shipped", "in_transit", "delivered"].includes(status),
} as const;
const supported = new Set<string>(SUPPORTED_GUIDED_STEP_IDS);

export async function resolveGuidedStepCompletions(
	workspaceId: string,
	stepIds: readonly string[],
	detectors: GuidedStepCompletionDetectors,
): Promise<readonly GuidedActionStepCompletion[]> {
	if (workspaceId.trim().length === 0)
		throw new Error("GUIDED_STEP_WORKSPACE_REQUIRED");
	const unique = [...new Set(stepIds)];
	for (const id of unique)
		if (!supported.has(id))
			throw new Error(`GUIDED_STEP_COMPLETION_UNSUPPORTED:${id}`);
	return Promise.all(
		unique.map(async (id) => ({
			id,
			completed: await detectors[id as SupportedGuidedStepId](workspaceId),
		})),
	);
}
