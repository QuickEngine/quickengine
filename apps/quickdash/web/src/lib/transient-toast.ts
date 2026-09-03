/**
 * Ids for the notices that more than one place can raise.
 *
 * 🔴 Shared so they COLLAPSE. A disconnect is noticed twice — by the window's
 * `offline` event and by every request that fails because of it — and without
 * one id the corner fills with the same sentence repeated. Toasts replace by
 * id, so the second sighting overwrites the first rather than stacking beside
 * it, and whichever place learns the situation has ended can dismiss it.
 */
export const TRANSIENT_TOAST = {
	offline: "connection-offline",
	rateLimit: "rate-limited",
} as const;
