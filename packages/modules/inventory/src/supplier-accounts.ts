import {
	and,
	db,
	eq,
	supplierPaymentAccounts,
	suppliers,
	workspaceEnvironment,
} from "@quickengine/db";
import { z } from "zod";

/**
 * The record that says a supplier can be paid.
 *
 * 🔴 Until something wrote this row, `settlementEligibility` answered
 * `SUPPLIER_NOT_ONBOARDED` for ever and no supplier could be paid automatically
 * however complete the rest of the rail was. The whole settlement chain existed
 * and was unreachable for want of one row.
 *
 * ⚠️ Scoped per ENVIRONMENT. A supplier's sandbox account and their live account
 * are different Stripe accounts and must never stand in for one another — paying
 * a real supplier from a rehearsal, or rehearsing against their real account, are
 * both worse than the flow simply not working.
 */

/**
 * Where the payment provider sends the supplier back to.
 *
 * ⚠️ Both are handed straight to the provider as redirect targets, so they are
 * held to real secure web addresses. Anything else is a link that either fails
 * or sends somebody somewhere nobody intended.
 */
export const supplierPayoutOnboardingSchema = z.object({
	returnUrl: z.url().startsWith("https://"),
	refreshUrl: z.url().startsWith("https://"),
	// ISO 3166-1 alpha-2. The provider fixes an account's country at creation.
	country: z.string().length(2).toUpperCase().optional(),
});

export class SupplierAccountError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
	}
}

/**
 * ⚠️ The DB column is a TypeScript-only enum with no database constraint, so a
 * widened `string` compiles here and fails at the driver. Named once, used
 * everywhere below.
 */
export type SupplierAccountStatus =
	| "pending"
	| "active"
	| "restricted"
	| "disconnected";

/**
 * The provider work, injected.
 *
 * 🔴 Inventory does not depend on payments, and must not start to — the
 * settlement runner already solves this the same way. Passing the two Stripe
 * calls in keeps the package boundary intact and makes both testable without a
 * provider.
 */
export type SupplierOnboarder = (input: {
	environment: "test" | "live";
	existingAccountId?: string | null;
	email?: string | null;
	country?: string | null;
	refreshUrl: string;
	returnUrl: string;
}) => Promise<{
	externalAccountId: string;
	transfersEnabled: "yes" | "no" | "unknown";
	status: SupplierAccountStatus;
	requirements: string | null;
	onboardingUrl: string;
}>;

export type SupplierAccountReader = (input: {
	environment: "test" | "live";
	externalAccountId: string;
}) => Promise<{
	externalAccountId: string;
	transfersEnabled: "yes" | "no" | "unknown";
	status: SupplierAccountStatus;
	requirements: string | null;
}>;

export type SupplierPaymentAccount = {
	supplierId: string;
	provider: string;
	environment: "test" | "live";
	externalAccountId: string;
	transfersEnabled: "yes" | "no" | "unknown";
	status: SupplierAccountStatus;
	requirements: string | null;
};

/**
 * Confirm a supplier exists in this workspace, or throw `NOT_FOUND`.
 *
 * Exported so an onboarding link is refused at the moment it is minted rather
 * than when the supplier opens it — emailing a partner a link that cannot work
 * is worse than telling the operator immediately.
 */
export async function assertSupplier(workspaceId: string, supplierId: string) {
	const [row] = await db
		.select({ id: suppliers.id, email: suppliers.contactEmail })
		.from(suppliers)
		.where(
			and(eq(suppliers.workspaceId, workspaceId), eq(suppliers.id, supplierId)),
		)
		.limit(1);
	if (!row) throw new SupplierAccountError("SUPPLIER_NOT_FOUND", "NOT_FOUND");
	return row;
}

/** What we currently believe, for one supplier in this workspace's mode. */
export async function getSupplierPaymentAccount(
	workspaceId: string,
	supplierId: string,
): Promise<SupplierPaymentAccount | null> {
	const environment = await workspaceEnvironment(workspaceId);
	const [row] = await db
		.select()
		.from(supplierPaymentAccounts)
		.where(
			and(
				eq(supplierPaymentAccounts.workspaceId, workspaceId),
				eq(supplierPaymentAccounts.supplierId, supplierId),
				eq(supplierPaymentAccounts.environment, environment),
			),
		)
		.limit(1);
	if (!row) return null;
	return {
		supplierId: row.supplierId,
		provider: row.provider,
		environment: row.environment,
		externalAccountId: row.externalAccountId,
		transfersEnabled: row.transfersEnabled,
		status: row.status,
		requirements: row.requirements,
	};
}

/**
 * Begin, or resume, connecting a supplier so they can be paid.
 *
 * 🔑 Returns a Stripe-hosted URL. The supplier completes their own identity
 * verification with Stripe directly — no bank details, tax id or documents ever
 * pass through QuickEngine, and no screen has to be built here to collect them.
 *
 * ⚠️ Resuming reuses the SAME Stripe account. Creating a second one would leave
 * a half-finished account nobody can reach and split a supplier's history in two.
 */
export async function connectSupplierPaymentAccount(input: {
	workspaceId: string;
	supplierId: string;
	refreshUrl: string;
	returnUrl: string;
	country?: string | null;
	onboard: SupplierOnboarder;
	/**
	 * The environment the caller believes it is onboarding for.
	 *
	 * 🔴 Supplied by the shareable link, which pins the mode at the moment it is
	 * issued. A workspace can flip between test and live at any time, so a link
	 * sent on Monday could otherwise be opened on Friday and attach a real bank
	 * account to a rehearsal — or a test account to a workspace now handling real
	 * money. Mismatches are refused rather than reconciled: the operator issues a
	 * new link, which is also the point at which a supplier must onboard again,
	 * because test and live are separate Stripe accounts.
	 *
	 * Omitted by the authenticated operator path, which is by definition acting
	 * on the workspace as it is right now.
	 */
	expectedEnvironment?: "test" | "live";
}): Promise<{ onboardingUrl: string; account: SupplierPaymentAccount }> {
	const supplier = await assertSupplier(input.workspaceId, input.supplierId);
	const environment = await workspaceEnvironment(input.workspaceId);
	if (input.expectedEnvironment && input.expectedEnvironment !== environment) {
		throw new SupplierAccountError(
			`SUPPLIER_LINK_ENVIRONMENT_MISMATCH:${input.expectedEnvironment}:${environment}`,
			"ENVIRONMENT_MISMATCH",
		);
	}
	const existing = await getSupplierPaymentAccount(
		input.workspaceId,
		input.supplierId,
	);

	const state = await input.onboard({
		environment,
		existingAccountId: existing?.externalAccountId ?? null,
		email: supplier.email,
		country: input.country ?? null,
		refreshUrl: input.refreshUrl,
		returnUrl: input.returnUrl,
	});

	const saved = await save(input.workspaceId, input.supplierId, environment, {
		externalAccountId: state.externalAccountId,
		transfersEnabled: state.transfersEnabled,
		status: state.status,
		requirements: state.requirements,
	});
	return { onboardingUrl: state.onboardingUrl, account: saved };
}

/**
 * Ask Stripe whether the supplier is ready, and write down the answer.
 *
 * 🔴 Onboarding finishes in Stripe's own UI and nothing tells us when. Without
 * this the stored state stays `pending` for ever and settlement keeps refusing a
 * supplier who has actually been ready for days.
 */
export async function refreshSupplierPaymentAccount(
	workspaceId: string,
	supplierId: string,
	read: SupplierAccountReader,
): Promise<SupplierPaymentAccount> {
	const existing = await getSupplierPaymentAccount(workspaceId, supplierId);
	if (!existing) {
		throw new SupplierAccountError("SUPPLIER_NOT_CONNECTED", "NOT_CONNECTED");
	}
	const state = await read({
		environment: existing.environment,
		externalAccountId: existing.externalAccountId,
	});
	return await save(workspaceId, supplierId, existing.environment, {
		externalAccountId: state.externalAccountId,
		transfersEnabled: state.transfersEnabled,
		status: state.status,
		requirements: state.requirements,
	});
}

async function save(
	workspaceId: string,
	supplierId: string,
	environment: "test" | "live",
	state: {
		externalAccountId: string;
		transfersEnabled: "yes" | "no" | "unknown";
		status: SupplierAccountStatus;
		requirements: string | null;
	},
): Promise<SupplierPaymentAccount> {
	const [row] = await db
		.insert(supplierPaymentAccounts)
		.values({
			workspaceId,
			supplierId,
			provider: "stripe",
			environment,
			externalAccountId: state.externalAccountId,
			transfersEnabled: state.transfersEnabled,
			status: state.status,
			requirements: state.requirements,
		})
		// One account per supplier per mode; resuming updates rather than duplicates.
		.onConflictDoUpdate({
			target: [
				supplierPaymentAccounts.supplierId,
				supplierPaymentAccounts.provider,
				supplierPaymentAccounts.environment,
			],
			set: {
				externalAccountId: state.externalAccountId,
				transfersEnabled: state.transfersEnabled,
				status: state.status,
				requirements: state.requirements,
				updatedAt: new Date(),
			},
		})
		.returning();
	if (!row) throw new SupplierAccountError("ACCOUNT_NOT_SAVED", "NOT_SAVED");
	return {
		supplierId: row.supplierId,
		provider: row.provider,
		environment: row.environment,
		externalAccountId: row.externalAccountId,
		transfersEnabled: row.transfersEnabled,
		status: row.status,
		requirements: row.requirements,
	};
}
