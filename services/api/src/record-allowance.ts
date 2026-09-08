import type { MutationResult } from "@quickengine/api-contracts";
import type { Context } from "hono";
import type { PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

/**
 * The monthly allowance on a business record, admitted and counted in one place.
 *
 * 🔴 One helper rather than eight copies, and that is the point. This same
 * shape has been got wrong three times in a week: a limit declared and never
 * counted, a gauge written in two places that disagreed, a seat floor enforced
 * on one path and not the other. Every module that creates a record now goes
 * through exactly these lines, so there is one thing to be right about.
 *
 * ⚠️ Free tiers only, in practice. Every paid plan sets these limits to `null`,
 * so `checkAllowance` admits and `overageFor` prices nothing. A paying customer
 * is never charged for the work they did, and this file does not need to know
 * that: it falls out of the plan definitions.
 */

type RecordMeter =
	| "ordersPerMonth"
	| "bookingsPerMonth"
	| "invoicesPerMonth"
	| "contractsPerMonth"
	| "quotesPerMonth"
	| "projectsPerMonth"
	| "timeEntriesPerMonth"
	| "shipmentsPerMonth"
	| "clientsPerMonth";

/**
 * May this account create one more of these?
 *
 * Returns a 402 to hand straight back, or null to carry on. Says what the plan
 * includes rather than reporting a failure: this is the moment somebody decides
 * whether to pay, and "you have used your 25" is a fact, not a fault.
 */
export async function admitRecord(
	c: Context<PlatformEnv>,
	meter: RecordMeter,
	/** Plural, lower case, for the message: "bookings", "invoices". */
	noun: string,
): Promise<Response | null> {
	const organizationId = c.get("authorized")?.workspace.organizationId;
	// No organization means no subscription to read and nothing to meter
	// against. Signup paths hit this, and refusing them would be worse than
	// letting an unbilled record through.
	if (!organizationId) return null;

	const { checkAllowance } = await import("@quickengine/billing");
	const room = await checkAllowance({ scopeId: organizationId, meter });
	if (room.allowed || room.limit === null) return null;

	return respondError(
		c,
		"USAGE_LIMIT_EXCEEDED",
		`Your plan includes ${room.limit} ${noun} a month. You can keep going and pay for what you use, upgrade for no limit at all, or wait for the month to reset.`,
		402,
	);
}

/**
 * Count a record that was actually written.
 *
 * 🔴 `source === "executed"` and nothing else. A `replayed` result is the
 * idempotent retry of a request already counted, and counting it again spends
 * somebody's month twice on one booking. A conflict wrote nothing at all.
 *
 * ⚠️ Swallows its own failure. The record is committed and correct; a usage row
 * that could not be written is a number to repair, never a reason to fail the
 * customer's work.
 */
export async function countRecord(
	c: Context<PlatformEnv>,
	meter: RecordMeter,
	result: MutationResult<unknown>,
): Promise<void> {
	if (result.kind !== "success" || result.source !== "executed") return;
	const organizationId = c.get("authorized")?.workspace.organizationId;
	if (!organizationId) return;
	try {
		const { meter: record } = await import("@quickengine/billing");
		await record({ scopeId: organizationId, meter });
	} catch {
		// Deliberately silent. See the note above.
	}
}
