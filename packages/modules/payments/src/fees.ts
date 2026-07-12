// Pure money math for the platform's optional application fee. All amounts are
// integer cents. Fee is expressed in basis points (bps): 100 bps = 1%. Default is 0
// — a workspace never pays QuickEngine to receive its own money unless the plan
// explicitly turns on a share.

/**
 * QuickEngine's cut of a payment, in cents. Floors to whole cents and can never
 * exceed the payment itself. A zero/negative amount or fee yields 0.
 */
export function applicationFeeCents(
	amountCents: number,
	feeBps: number,
): number {
	if (amountCents <= 0 || feeBps <= 0) {
		return 0;
	}
	const fee = Math.floor((amountCents * feeBps) / 10_000);
	return Math.min(fee, amountCents);
}

/** What actually lands in the connected account after the platform fee. */
export function netToConnectedAccountCents(
	amountCents: number,
	feeCents: number,
): number {
	return Math.max(0, amountCents - feeCents);
}
