import { db, eq } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { meter } from "./metering";

/**
 * Count mail a customer's business sent.
 *
 * 🔴 **Counted and charged, never blocked.** Every other meter can refuse the
 * next unit of work; this one must not. The mail in question is an order
 * confirmation, a shipping notice, a booking reminder: refusing to send it does
 * not inconvenience our customer, it strands THEIR customer, who never learns
 * their parcel shipped and has no idea a billing limit exists. The cost to us is
 * $0.0004; the cost of not sending it is somebody's reputation.
 *
 * ⚠️ Takes a WORKSPACE and resolves the organization itself. Every mail-sending
 * path in the product already holds a workspace id and almost none of them hold
 * an organization id, so asking for the organization would have meant a lookup
 * at each of fourteen call sites, which is fourteen chances to forget one.
 */
export async function meterWorkspaceEmails({
	workspaceId,
	count = 1,
}: {
	workspaceId: string;
	/** One per RECIPIENT: the provider charges us per delivery, not per call. */
	count?: number;
}): Promise<void> {
	if (count <= 0) return;
	const [row] = await db
		.select({ organizationId: quickengineWorkspaces.organizationId })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!row?.organizationId) return;
	await meter({
		scopeId: row.organizationId,
		meter: "emailsSent",
		amount: count,
	});
}
