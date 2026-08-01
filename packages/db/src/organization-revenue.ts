import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "./client";
import { payments } from "./schema/payments";
import { quickengineWorkspaces } from "./schema/quickengine";

export type WorkspaceRevenue = {
	workspaceId: string;
	workspaceName: string;
	currency: string;
	collectedCents: number;
	refundedCents: number;
	netCents: number;
	paymentCount: number;
};

export type OrganizationRevenue = {
	from: Date;
	to: Date;
	/**
	 * Totals per currency, never summed across them.
	 *
	 * 🔴 Adding 100 USD to 100 EUR gives 200 of nothing. A single headline number
	 * would need a rate table, a rate date, and a decision about which of those to
	 * show a customer disputing it — none of which exists. Reporting per currency
	 * is honest and lets the UI decide how to present a multi-currency account.
	 */
	totals: Array<{
		currency: string;
		collectedCents: number;
		refundedCents: number;
		netCents: number;
		paymentCount: number;
	}>;
	/** The same figures split by workspace, for the control plane's table. */
	workspaces: WorkspaceRevenue[];
};

const cents = (value: string | null): number => Number(value ?? 0);

/**
 * Revenue across every workspace an organization owns.
 *
 * 🔑 Why this exists separately from `/v1/reports/revenue`. That endpoint is
 * workspace-scoped, which is right for QuickDash — an operator is working inside
 * one business. Account is the control plane and answers a different question:
 * "how is the whole organization doing". Rolling that up in the client would
 * mean N requests and a total that changes depending on which ones failed.
 *
 * **Reconciles to canonical payment data**, not to an estimate: `succeededAt`
 * and `refundedAt` on real payment rows, the same source
 * `/v1/reports/revenue` uses. The Account pages this replaces were removed for
 * showing hardcoded figures, so anything here has to be traceable to a payment
 * somebody can look up.
 *
 * A refund is counted in the period it was **refunded**, not the period the
 * payment succeeded. Otherwise a refund silently rewrites a closed month.
 */
export async function getOrganizationRevenue(
	organizationId: string,
	range: { from: Date; to: Date },
): Promise<OrganizationRevenue> {
	const owned = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.organizationId, organizationId));

	if (owned.length === 0) {
		return { from: range.from, to: range.to, totals: [], workspaces: [] };
	}

	const workspaceIds = owned.map((row) => row.id);
	const names = new Map(owned.map((row) => [row.id, row.name]));

	const [collected, refunded] = await Promise.all([
		db
			.select({
				workspaceId: payments.workspaceId,
				currency: payments.currency,
				amountCents: sql<string>`sum(${payments.amountCents})::text`,
				count: sql<number>`count(*)::int`,
			})
			.from(payments)
			.where(
				and(
					inArray(payments.workspaceId, workspaceIds),
					gte(payments.succeededAt, range.from),
					lt(payments.succeededAt, range.to),
				),
			)
			.groupBy(payments.workspaceId, payments.currency),
		db
			.select({
				workspaceId: payments.workspaceId,
				currency: payments.currency,
				amountCents: sql<string>`sum(${payments.amountCents})::text`,
			})
			.from(payments)
			.where(
				and(
					inArray(payments.workspaceId, workspaceIds),
					gte(payments.refundedAt, range.from),
					lt(payments.refundedAt, range.to),
				),
			)
			.groupBy(payments.workspaceId, payments.currency),
	]);

	// Keyed by workspace AND currency: one workspace may take both.
	const rows = new Map<string, WorkspaceRevenue>();
	const key = (workspaceId: string, currency: string) =>
		`${workspaceId}:${currency}`;

	for (const row of collected) {
		rows.set(key(row.workspaceId, row.currency), {
			workspaceId: row.workspaceId,
			workspaceName: names.get(row.workspaceId) ?? "",
			currency: row.currency,
			collectedCents: cents(row.amountCents),
			refundedCents: 0,
			netCents: cents(row.amountCents),
			paymentCount: row.count,
		});
	}

	for (const row of refunded) {
		const id = key(row.workspaceId, row.currency);
		const existing = rows.get(id) ?? {
			workspaceId: row.workspaceId,
			workspaceName: names.get(row.workspaceId) ?? "",
			currency: row.currency,
			collectedCents: 0,
			refundedCents: 0,
			netCents: 0,
			paymentCount: 0,
		};
		// A refund whose original payment landed in an earlier period still belongs
		// here, which is why it can create a row with no collection against it.
		existing.refundedCents += cents(row.amountCents);
		existing.netCents = existing.collectedCents - existing.refundedCents;
		rows.set(id, existing);
	}

	const workspaces = [...rows.values()].sort(
		(a, b) =>
			b.netCents - a.netCents || a.workspaceName.localeCompare(b.workspaceName),
	);

	const byCurrency = new Map<string, OrganizationRevenue["totals"][number]>();
	for (const row of workspaces) {
		const total = byCurrency.get(row.currency) ?? {
			currency: row.currency,
			collectedCents: 0,
			refundedCents: 0,
			netCents: 0,
			paymentCount: 0,
		};
		total.collectedCents += row.collectedCents;
		total.refundedCents += row.refundedCents;
		total.netCents += row.netCents;
		total.paymentCount += row.paymentCount;
		byCurrency.set(row.currency, total);
	}

	return {
		from: range.from,
		to: range.to,
		totals: [...byCurrency.values()].sort((a, b) =>
			a.currency.localeCompare(b.currency),
		),
		workspaces,
	};
}
