"use server";

import { getSession } from "@quickengine/auth/server";
import {
	markAllNotificationsRead,
	markNotificationRead,
} from "@quickengine/db";
import { headers } from "next/headers";

// Mark a single notification read. Scoped to the signed-in user in the query, so a
// user can never mark another user's notification.
export async function markNotificationReadAction(id: string): Promise<void> {
	const session = await getSession(await headers());
	if (!session) return;
	await markNotificationRead(session.user.id, id);
}

export async function markAllNotificationsReadAction(): Promise<void> {
	const session = await getSession(await headers());
	if (!session) return;
	await markAllNotificationsRead(session.user.id);
}
