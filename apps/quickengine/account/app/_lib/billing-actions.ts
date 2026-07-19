"use server";

import { can } from "@quickengine/auth/rbac";
import { getSession } from "@quickengine/auth/server";
import {
	createSubscriptionForPaymentElement,
	getAccountPlanId,
	getPlan,
} from "@quickengine/billing";
import { listOrganizationMembers, resolveOrgRole } from "@quickengine/db";
import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import { headers } from "next/headers";
import { resolveActiveOrg } from "./active-org";

// Start a subscription for the active org's chosen plan and return the confirmation client
// secret for our custom Payment Element checkout. Org-scoped: the signed-in user must hold
// `billing.manage`, and seats = the org's member count. The subscription id lets the success
// page reconcile the plan immediately (no Stripe CLI needed in dev).
export async function startSubscriptionAction(
	planId: QuickEnginePlanId,
	cycle: QuickEngineBillingCycle,
): Promise<{ clientSecret?: string; subscriptionId?: string; error?: string }> {
	const session = await getSession(await headers());
	if (!session) return { error: "Please sign in again." };

	const org = await resolveActiveOrg(session.user.id);
	if (!org) return { error: "No organization was found for your account." };

	const role = await resolveOrgRole(session.user.id, org.id);
	if (!role || !can(role, "billing.manage")) {
		return { error: "You don't have permission to manage this org's billing." };
	}

	const members = await listOrganizationMembers(org.id);

	try {
		const result = await createSubscriptionForPaymentElement({
			organizationId: org.id,
			billingEmail: session.user.email,
			billingName: session.user.name ?? undefined,
			planId,
			cycle,
			seats: members.length,
		});
		return result.clientSecret
			? {
					clientSecret: result.clientSecret,
					subscriptionId: result.subscriptionId,
				}
			: { error: "Stripe did not return a payment secret." };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : "Checkout failed.",
		};
	}
}

// The active org's current plan, for the settings billing tab.
export async function getCurrentPlanSummary(): Promise<{
	displayName: string;
} | null> {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await resolveActiveOrg(session.user.id);
	if (!org) return null;
	const planId = await getAccountPlanId(org.id);
	return { displayName: getPlan(planId)?.displayName ?? "Free" };
}
