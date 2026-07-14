"use server";

import { getSession } from "@quickengine/auth/server";
import { getAccountPlanId, getPlan, getUsage } from "@quickengine/billing";
import { and, db, eq, fileDocuments } from "@quickengine/db";
import {
	quickengineOrganizations,
	quickengineSubscriptions,
	quickengineUsers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { headers } from "next/headers";

export type UpgradeState = {
	/** Whether to render the upgrade CTA at all (hidden on the top tier). */
	show: boolean;
	/** none = plenty of headroom · nudge = a meter at 80% · over = a meter maxed. */
	urgency: "none" | "nudge" | "over";
	planName: string;
};

// Powers the subtle header "Upgrade" button. Shows for every tier below the top
// self-serve one, and escalates (nudge → over) as the account approaches its
// usage limits, so the CTA is present but only gets louder when it's earned.
export async function getUpgradeState(): Promise<UpgradeState> {
	const session = await getSession(await headers());
	if (!session) {
		return { show: false, urgency: "none", planName: "" };
	}
	const scopeId = session.user.id;
	const planId = await getAccountPlanId(scopeId);
	const planName = getPlan(planId)?.displayName ?? "Free";
	// Nothing above Team/Enterprise to sell — don't nag them.
	if (planId === "team" || planId === "enterprise") {
		return { show: false, urgency: "none", planName };
	}
	const states = Object.values(await getUsage({ scopeId })).map((m) => m.state);
	const urgency = states.includes("over")
		? "over"
		: states.includes("warn")
			? "nudge"
			: "none";
	return { show: true, urgency, planName };
}

// Permanently delete the signed-in user's account. Deleting the user row cascades
// to sessions, accounts, workspaces, 2FA, and passkeys (those FKs are ON DELETE
// CASCADE); subscriptions + organizations reference the user WITHOUT cascade, so
// clear them first — inside one transaction — or the delete would be blocked.
export async function deleteAccount() {
	const session = await getSession(await headers());
	if (!session) {
		throw new Error("UNAUTHENTICATED");
	}
	const userId = session.user.id;
	const [storedFile] = await db
		.select({ id: fileDocuments.id })
		.from(fileDocuments)
		.innerJoin(
			quickengineWorkspaces,
			and(
				eq(quickengineWorkspaces.id, fileDocuments.workspaceId),
				eq(quickengineWorkspaces.ownerId, userId),
			),
		)
		.limit(1);
	if (storedFile) throw new Error("ACCOUNT_HAS_STORED_FILES");
	await db.transaction(async (tx) => {
		await tx
			.delete(quickengineSubscriptions)
			.where(eq(quickengineSubscriptions.userId, userId));
		await tx
			.delete(quickengineOrganizations)
			.where(eq(quickengineOrganizations.ownerId, userId));
		await tx.delete(quickengineUsers).where(eq(quickengineUsers.id, userId));
	});
}
