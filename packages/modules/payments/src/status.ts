// Payment lifecycle, kept pure so the state machine is testable without a DB or
// Stripe. Mirrors the meaningful Stripe PaymentIntent outcomes.

export const PAYMENT_STATUSES = [
	"pending",
	"processing",
	"succeeded",
	"failed",
	"disputed",
	"refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// pending → processing → succeeded is the happy path; a succeeded payment can later
// be refunded. failed and refunded are terminal. A payment can go straight to
// succeeded (fast confirmation) or fail from either pending or processing.
const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
	pending: ["processing", "succeeded", "failed"],
	processing: ["succeeded", "failed"],
	succeeded: ["disputed", "refunded"],
	failed: [],
	disputed: ["succeeded", "refunded"],
	refunded: [],
};

/** Whether a payment may move from one status to another. */
export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
