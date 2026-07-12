"use server";

import { getSession } from "@quickengine/auth/server";
import { db, eq } from "@quickengine/db";
import {
	quickengineOrganizations,
	quickengineSubscriptions,
	quickengineUsers,
} from "@quickengine/db/schema/quickengine";
import { headers } from "next/headers";

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
