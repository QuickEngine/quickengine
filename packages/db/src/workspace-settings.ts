import { z } from "zod";
import { db, eq, quickengineWorkspaces } from "./index";

/**
 * Everything a workspace configures that no single module owns.
 *
 * 🔴 Grouped by the SECTION it appears in, not by the table it affects. These
 * are read by a settings screen far more often than by anything else, and a
 * flat bag of forty booleans is unreadable at both ends — the form has to
 * reconstruct the grouping anyway, so the grouping is the storage.
 *
 * ⚠️ Every group and every field has a default, and the whole object is
 * `.parse()`d on read. A workspace created before any of this existed holds
 * `{}` and must come back fully populated rather than undefined — otherwise
 * every consumer needs its own fallback and they will disagree.
 *
 * 🔑 Adding a setting is: a field here with a default, and a control on the
 * form. No migration, because the column is one blob — which is exactly why it
 * is one blob.
 */

const money = z.number().int().nonnegative().max(2_147_483_647);
const url = z.string().trim().max(300).nullable().default(null);

export const workspaceSettingsSchema = z.object({
	/** What a customer must give you, and what an order must be worth. */
	checkout: z
		.object({
			allowGuestOrders: z.boolean().default(true),
			requirePhone: z.boolean().default(false),
			requireTermsAccepted: z.boolean().default(false),
			requireAgeConfirmation: z.boolean().default(false),
			/** 🔴 Zero means NO minimum, not "orders must be free". */
			minimumOrderCents: money.default(0),
			maximumOrderCents: money.default(0),
			separateBillingAddress: z.boolean().default(false),
		})
		.default({}),

	/**
	 * ⚠️ The RULES only. Individual rates live on the orders module
	 * (`taxRateBasisPoints`) and, when jurisdictions land, in their own table —
	 * a rate per region is rows, not settings.
	 */
	tax: z
		.object({
			pricesIncludeTax: z.boolean().default(false),
			chargeTaxOnShipping: z.boolean().default(false),
			showTaxSeparately: z.boolean().default(true),
			dutiesDisclaimer: z.string().trim().max(500).nullable().default(null),
		})
		.default({}),

	returns: z
		.object({
			windowDays: z.number().int().min(0).max(365).default(30),
			requireReason: z.boolean().default(true),
			autoApprove: z.boolean().default(false),
			allowExchanges: z.boolean().default(true),
			/** 🔴 Refunds do NOT restock today; this is what makes them. */
			restockOnRefund: z.boolean().default(true),
			returnShippingPaidBy: z
				.enum(["customer", "business"])
				.default("customer"),
		})
		.default({}),

	discounts: z
		.object({
			allowStacking: z.boolean().default(false),
			autoApplyEligible: z.boolean().default(false),
			showCodeFieldAtCheckout: z.boolean().default(true),
			maxPerOrder: z.number().int().min(1).max(20).default(1),
		})
		.default({}),

	/** Whether a shopper can have an account, and what it takes to get one. */
	accounts: z
		.object({
			allowRegistration: z.boolean().default(true),
			requireVerifiedEmail: z.boolean().default(false),
			allowSelfDeletion: z.boolean().default(true),
		})
		.default({}),

	/** Which automatic emails a CUSTOMER receives. */
	customerEmail: z
		.object({
			orderStatusChanges: z.boolean().default(true),
			shipmentTracking: z.boolean().default(true),
			deliveryConfirmation: z.boolean().default(true),
			reviewRequest: z.boolean().default(false),
			backInStock: z.boolean().default(false),
			marketing: z.boolean().default(false),
		})
		.default({}),

	reviews: z
		.object({
			autoPublish: z.boolean().default(false),
			verifiedBuyersOnly: z.boolean().default(false),
			allowImages: z.boolean().default(false),
			requestAfterDays: z.number().int().min(0).max(180).default(7),
		})
		.default({}),

	/** Which events reach the OPERATOR. */
	notifications: z
		.object({
			newOrder: z.boolean().default(true),
			lowStock: z.boolean().default(true),
			paymentFailure: z.boolean().default(true),
			newReview: z.boolean().default(false),
			dailySummary: z.boolean().default(false),
		})
		.default({}),

	/**
	 * ⚠️ Retention is a PROMISE, and nothing enforces it yet. The values are
	 * stored and shown; the job that acts on them does not exist. Recorded in
	 * TECH_DEBT rather than implied by a switch that does nothing.
	 */
	retention: z
		.object({
			orderHistoryDays: z.number().int().min(0).max(3_650).default(0),
			activityLogDays: z.number().int().min(0).max(3_650).default(365),
			cookieConsent: z.boolean().default(false),
			allowDataExportRequests: z.boolean().default(true),
		})
		.default({}),

	/** Public profiles. Anything blank is hidden rather than linked to nothing. */
	social: z
		.object({
			instagram: url,
			x: url,
			facebook: url,
			tiktok: url,
			youtube: url,
			linkedin: url,
			pinterest: url,
			discord: url,
		})
		.default({}),

	/** Where a customer is sent for the words that are not ours to write. */
	legal: z
		.object({
			privacy: url,
			terms: url,
			refunds: url,
			shipping: url,
			returns: url,
			accessibility: url,
		})
		.default({}),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

/** Every setting, with defaults filled in for anything never saved. */
export async function getWorkspaceSettings(
	workspaceId: string,
): Promise<WorkspaceSettings | null> {
	const [row] = await db
		.select({ settings: quickengineWorkspaces.settings })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!row) return null;
	// 🔴 A stored blob that no longer parses must not take the screen down with
	// it. Anything unrecognised falls back to the default for that field.
	const parsed = workspaceSettingsSchema.safeParse(row.settings ?? {});
	return parsed.success ? parsed.data : workspaceSettingsSchema.parse({});
}

/**
 * Replace one group.
 *
 * 🔑 Per GROUP rather than the whole object: two people in two sections of the
 * same dialog must not overwrite each other's work, and the form only ever
 * knows the group it is showing.
 */
export async function setWorkspaceSettingsGroup(input: {
	workspaceId: string;
	group: keyof WorkspaceSettings;
	value: unknown;
}): Promise<WorkspaceSettings | null> {
	const current = await getWorkspaceSettings(input.workspaceId);
	if (!current) return null;
	const next = workspaceSettingsSchema.parse({
		...current,
		[input.group]: input.value,
	});
	await db
		.update(quickengineWorkspaces)
		.set({ settings: next, updatedAt: new Date() })
		.where(eq(quickengineWorkspaces.id, input.workspaceId));
	return next;
}
