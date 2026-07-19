"use server";

import { getSession } from "@quickengine/auth/server";
import { createOrganization, listOrganizationsForUser } from "@quickengine/db";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE } from "./active-org";

const COOKIE_OPTIONS = {
	httpOnly: true,
	sameSite: "lax",
	path: "/",
	maxAge: 60 * 60 * 24 * 365,
} as const;

/** Switch the active organization. Ignores an org the user isn't a member of. */
export async function setActiveOrgAction(orgId: string): Promise<void> {
	const session = await getSession(await headers());
	if (!session) return;
	const orgs = await listOrganizationsForUser(session.user.id);
	if (!orgs.some((org) => org.id === orgId)) return;
	(await cookies()).set(ACTIVE_ORG_COOKIE, orgId, COOKIE_OPTIONS);
	revalidatePath("/", "layout");
}

export type CreateOrgState = { error: string | null };

/** Create a shared org, make it the active org, and land on the home for it. */
export async function createOrgAction(
	_previous: CreateOrgState,
	formData: FormData,
): Promise<CreateOrgState> {
	const session = await getSession(await headers());
	if (!session) {
		return { error: "Your session expired. Please sign in again." };
	}
	const name = String(formData.get("name") ?? "").trim();
	if (!name) return { error: "Enter an organization name." };
	if (name.length > 120) {
		return { error: "Organization names must be 120 characters or fewer." };
	}

	const org = await createOrganization(name, session.user.id);
	(await cookies()).set(ACTIVE_ORG_COOKIE, org.id, COOKIE_OPTIONS);
	revalidatePath("/", "layout");
	redirect("/");
}
