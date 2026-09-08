import { inngest } from "@quickengine/jobs";

/**
 * Charge everybody for what they used last month.
 *
 * 🔴 **Nothing billed anybody for usage until this existed.** The prices, the
 * allowances, the free-tier spend cap and the invoice writer were all built and
 * all correct, and no scheduled job ever called them. This is the one line that
 * turns the pricing model into money.
 *
 * ── Why monthly, and why the first of the month ──────────────────────────────
 *
 * ⚠️ `billOverage` charges the TOTAL over the allowance rather than an
 * increment, so running it twice in a period bills the first total and then the
 * second. It must run exactly once per account per period, after the period has
 * closed. Usage counters reset on the calendar month in UTC, so the first is
 * when the previous month is final.
 *
 * 04:00 UTC rather than midnight: nothing is urgent about a monthly invoice, and
 * the hour after a reset is when every other rollover in the system is busiest.
 *
 * 🔴 `concurrency: 1` and `retries: 0` together. Two overlapping runs would
 * both read the same usage and both write invoice items, and Stripe's
 * idempotency key would only save us where the block count happened to match. A
 * retry of a partially completed run has the same problem, so a failure waits
 * for a human rather than compounding. `runUsageBilling` already isolates one
 * account's failure from the rest, so a single bad customer cannot cost us the
 * month.
 */
export const usageBilling = inngest.createFunction(
	{
		id: "usage-billing",
		concurrency: 1,
		retries: 0,
		triggers: [{ cron: "0 4 1 * *" }],
	},
	async () => {
		// Lazy, per hard rule 12: nothing that merely REGISTERS a function should
		// pull the Stripe SDK into the module graph of route registration.
		const { runUsageBilling } = await import("@quickengine/billing");
		const result = await runUsageBilling({});
		const totalCents = result.charged.reduce(
			(sum, bill) => sum + bill.chargedCents,
			0,
		);
		console.info(
			`[usage-billing] ${result.accounts} accounts, ${result.charged.length} billed, ${result.failed} failed, ${totalCents} cents`,
		);
		return {
			accounts: result.accounts,
			billed: result.charged.length,
			failed: result.failed,
			totalCents,
		};
	},
);
