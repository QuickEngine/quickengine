/**
 * Drain the outbox locally, the way the hourly cron does in production.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Nothing drains the outbox on a developer machine. Inngest is the trigger in
 * production, and locally it is simply absent — so `order.paid` commits, the
 * event sits in `api_outbox_events` forever, and the whole reactive half of the
 * product appears broken: no customer email, no supplier handoff, no purchase
 * order raised. The 2026-08-19 rehearsal lost time to exactly this and recorded
 * it as finding #9.
 *
 * Running this beside `pnpm dev` makes a local rehearsal behave like production.
 *
 * ⚠️ Local databases only, and deliberately unskippable. Draining the outbox
 * SENDS THINGS — customer email, supplier orders, outbound webhooks. Pointed at
 * production it would re-send whatever happened to be pending.
 *
 * Usage:
 *   pnpm outbox:drain            # drain once and stop
 *   pnpm outbox:drain --watch    # keep draining every 2s
 *   pnpm outbox:drain --renew    # also run subscription renewals
 */
import {
	dispatchPendingEvents,
	renewDueSubscriptions,
} from "@quickengine/event-dispatch";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
	throw new Error(
		"Refusing to drain the outbox against a non-local database. This sends real email and places real supplier orders.",
	);
}

const watch = process.argv.includes("--watch");
const renew = process.argv.includes("--renew");

async function once() {
	const result = await dispatchPendingEvents();
	if (result.claimed > 0) {
		console.log(
			`outbox: claimed ${result.claimed}, published ${result.published}, retrying ${result.retrying}, gave up ${result.exhausted}`,
		);
	}
	if (renew) {
		const renewals = await renewDueSubscriptions();
		if (renewals.claimed > 0) {
			console.log(
				`renewals: claimed ${renewals.claimed}, ordered ${renewals.ordered}, failed ${renewals.failed}`,
			);
		}
	}
	return result;
}

if (watch) {
	console.log("Draining every 2s. Ctrl-C to stop.");
	for (;;) {
		try {
			await once();
		} catch (error) {
			// One bad event must not stop the loop — the same rule the production
			// dispatcher follows.
			console.error("drain failed:", error);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
} else {
	const result = await once();
	console.log(
		`Done. ${result.published} published, ${result.retrying} retrying, ${result.exhausted} gave up.`,
	);
	process.exit(0);
}
