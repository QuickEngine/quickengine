export const QUOTE_ESTIMATE_STATUSES = [
	"draft",
	"sent",
	"accepted",
	"declined",
	"expired",
	"superseded",
	"converted",
	"voided",
] as const;

export type QuoteEstimateStatus = (typeof QUOTE_ESTIMATE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<
	QuoteEstimateStatus,
	readonly QuoteEstimateStatus[]
> = {
	draft: ["sent", "voided"],
	sent: ["accepted", "declined", "expired", "superseded", "voided"],
	accepted: ["converted", "superseded", "voided"],
	declined: ["superseded"],
	expired: ["superseded"],
	superseded: [],
	converted: [],
	voided: [],
};

export function canTransitionQuoteEstimate(
	from: QuoteEstimateStatus,
	to: QuoteEstimateStatus,
): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isQuoteEstimateEditable(status: QuoteEstimateStatus): boolean {
	return status === "draft";
}

export function canReviseQuoteEstimate(status: QuoteEstimateStatus): boolean {
	return ["sent", "accepted", "declined", "expired"].includes(status);
}

export function canConvertQuoteEstimate(status: QuoteEstimateStatus): boolean {
	return status === "accepted";
}
