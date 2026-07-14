export const ORDER_STATUSES = [
	"draft",
	"placed",
	"confirmed",
	"processing",
	"fulfilled",
	"cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	draft: ["placed", "cancelled"],
	placed: ["confirmed", "cancelled"],
	confirmed: ["processing", "cancelled"],
	processing: ["fulfilled", "cancelled"],
	fulfilled: [],
	cancelled: [],
};

export function canTransitionOrder(
	from: OrderStatus,
	to: OrderStatus,
): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
