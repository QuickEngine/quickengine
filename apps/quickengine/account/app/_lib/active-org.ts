import {
	listOrganizationsForUser,
	type UserOrganization,
} from "@quickengine/db";
import { cookies } from "next/headers";

// Which organization the user is currently viewing. Stored in a cookie and always validated
// against membership, so a stale or forged value can never grant access; it falls back to the
// personal org.
export const ACTIVE_ORG_COOKIE = "qe_active_org";

export type OrgContext = {
	orgs: UserOrganization[];
	active: UserOrganization | null;
};

export async function loadOrgContext(userId: string): Promise<OrgContext> {
	const orgs = await listOrganizationsForUser(userId);
	if (orgs.length === 0) {
		return { orgs, active: null };
	}
	const selected = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
	const active =
		orgs.find((org) => org.id === selected) ??
		orgs.find((org) => org.isPersonal) ??
		orgs[0];
	return { orgs, active };
}

/** The active org only — for surfaces that don't need the full switcher list. */
export async function resolveActiveOrg(
	userId: string,
): Promise<UserOrganization | null> {
	return (await loadOrgContext(userId)).active;
}
