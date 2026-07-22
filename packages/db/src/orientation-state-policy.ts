export const QUICKDASH_ORIENTATION_VERSION = 1;

export type QuickDashOrientationOutcome = "completed" | "skipped";

export function shouldOfferQuickDashOrientation(
	stored:
		| { orientationVersion: number; outcome: QuickDashOrientationOutcome }
		| undefined,
) {
	return !stored || stored.orientationVersion !== QUICKDASH_ORIENTATION_VERSION;
}
