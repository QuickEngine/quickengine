import { z } from "zod";

export const BILLING_ROUNDING_MODES = [
	"none",
	"nearest",
	"up",
	"down",
] as const;
export type BillingRoundingMode = (typeof BILLING_ROUNDING_MODES)[number];

export const billingRoundingSchema = z.object({
	mode: z.enum(BILLING_ROUNDING_MODES).default("none"),
	incrementMinutes: z.number().int().positive().max(60).default(1),
});

export function roundBillableSeconds(
	durationSeconds: number,
	incrementMinutes: number,
	mode: BillingRoundingMode,
): number {
	if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
		throw new Error("INVALID_TIME_ENTRY_DURATION");
	}
	const incrementSeconds = incrementMinutes * 60;
	if (!Number.isInteger(incrementMinutes) || incrementMinutes <= 0) {
		throw new Error("INVALID_BILLING_INCREMENT");
	}
	if (mode === "none") return durationSeconds;
	const units = durationSeconds / incrementSeconds;
	const roundedUnits =
		mode === "up"
			? Math.ceil(units)
			: mode === "down"
				? Math.floor(units)
				: Math.round(units);
	return roundedUnits * incrementSeconds;
}

export function calculateTimeAmountCents(
	durationSeconds: number,
	hourlyRateCents: number,
	incrementMinutes = 1,
	mode: BillingRoundingMode = "none",
): number {
	if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0) {
		throw new Error("INVALID_HOURLY_RATE");
	}
	const billableSeconds = roundBillableSeconds(
		durationSeconds,
		incrementMinutes,
		mode,
	);
	const amount = Math.round((billableSeconds * hourlyRateCents) / 3_600);
	if (amount > 2_147_483_647) throw new Error("TIME_ENTRY_AMOUNT_EXCEEDED");
	return amount;
}
