export const FULFILLMENT_STATUSES = [
	"pending",
	"in_progress",
	"fulfilled",
	"failed",
	"cancelled",
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
	pending: ["in_progress", "fulfilled", "failed", "cancelled"],
	in_progress: ["fulfilled", "failed", "cancelled"],
	fulfilled: [],
	failed: [],
	cancelled: [],
};

export function canTransition(
	from: FulfillmentStatus,
	to: FulfillmentStatus,
): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
