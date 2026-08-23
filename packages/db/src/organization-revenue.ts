import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	sql,
} from "drizzle-orm";
import { db } from "./client";
import { paymentAccounts, payments } from "./schema/payments";
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
	/**
	 * Net revenue per day, per workspace, per currency — the shape a trend line
	 * needs.
	 *
	 * 🔑 Only days that saw money appear. Filling the gaps is the caller's job,
	 * because only the caller knows how wide the axis it is drawing is, and an
	 * empty day is genuinely absent data rather than a zero somebody recorded.
	 *
	 * Bucketed in UTC. The totals above are computed from the same rows, so a
	 * chart drawn from this and a figure read from those always agree.
	 */
	daily: Array<{
		/** `YYYY-MM-DD`. */
		day: string;
		workspaceId: string;
		currency: string;
		collectedCents: number;
		refundedCents: number;
		netCents: number;
	}>;
};

const cents = (value: string | null): number => Number(value ?? 0);

/** One settled payment, named well enough to be recognised without opening it. */
export type OrganizationSettlement = {
	id: string;
	workspaceId: string;
	workspaceName: string;
	clientName: string | null;
	amountCents: number;
	currency: string;
	status: string;
	provider: string;
	paymentMethod: string;
	environment: string;
	settledAt: Date;
};

/**
 * The organization's most recent settlements, newest first.
 *
 * 🔑 Aggregates are only believable if you can see what they are made of. The
 * revenue figures above are sums; this is the evidence — individual payments an
 * operator can recognise and go look up at the provider.
 *
 * Ordered by `succeededAt`, and only settled money: a pending intent is not
 * revenue and does not belong in a list that sits under a revenue total.
 */
/**
 * environment-unfiltered: the organization control plane shows BOTH modes.
 *
 * This is the owner's cross-workspace view, and every row carries its own
 * `environment` so a sandbox settlement is labelled as one rather than hidden.
 * ⚠️ The MONEY TOTAL below is the opposite case and stays pinned to `live` — a
 * figure has no room to label itself, so an unfiltered one is simply wrong.
 */
export async function listOrganizationSettlements(
	organizationId: string,
	options: { limit?: number } = {},
): Promise<OrganizationSettlement[]> {
	const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
	const rows = await db
		.select({
			id: payments.id,
			workspaceId: payments.workspaceId,
			workspaceName: quickengineWorkspaces.name,
			clientName: payments.clientName,
			amountCents: payments.amountCents,
			currency: payments.currency,
			status: payments.status,
			provider: payments.provider,
			paymentMethod: payments.paymentMethod,
			environment: payments.environment,
			settledAt: payments.succeededAt,
		})
		.from(payments)
		.innerJoin(
			quickengineWorkspaces,
			eq(quickengineWorkspaces.id, payments.workspaceId),
		)
		.where(
			and(
				eq(quickengineWorkspaces.organizationId, organizationId),
				isNotNull(payments.succeededAt),
			),
		)
		.orderBy(desc(payments.succeededAt))
		.limit(limit);

	return rows.flatMap((row) =>
		row.settledAt ? [{ ...row, settledAt: row.settledAt }] : [],
	);
}

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
		return {
			from: range.from,
			to: range.to,
			totals: [],
			workspaces: [],
			daily: [],
		};
	}

	const workspaceIds = owned.map((row) => row.id);
	const names = new Map(owned.map((row) => [row.id, row.name]));

	// `date_trunc` to the day, in UTC, exactly as the workspace-scoped reporting
	// series does — so the two never disagree about which day a payment fell on.
	const collectedDay = sql<string>`to_char(date_trunc('day', ${payments.succeededAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
	const refundedDay = sql<string>`to_char(date_trunc('day', ${payments.refundedAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

	const [collected, refunded, collectedDaily, refundedDaily] =
		await Promise.all([
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
						// 🔴 LIVE only. A sandbox payment is a test card, and counting
						// one as revenue tells an owner they earned money they did not.
						eq(payments.environment, "live"),
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
						// 🔴 LIVE only. A sandbox payment is a test card, and counting
						// one as revenue tells an owner they earned money they did not.
						eq(payments.environment, "live"),
						gte(payments.refundedAt, range.from),
						lt(payments.refundedAt, range.to),
					),
				)
				.groupBy(payments.workspaceId, payments.currency),
			db
				.select({
					day: collectedDay,
					workspaceId: payments.workspaceId,
					currency: payments.currency,
					amountCents: sql<string>`sum(${payments.amountCents})::text`,
				})
				.from(payments)
				.where(
					and(
						inArray(payments.workspaceId, workspaceIds),
						// 🔴 LIVE only. A sandbox payment is a test card, and counting
						// one as revenue tells an owner they earned money they did not.
						eq(payments.environment, "live"),
						gte(payments.succeededAt, range.from),
						lt(payments.succeededAt, range.to),
					),
				)
				.groupBy(sql`1`, payments.workspaceId, payments.currency),
			db
				.select({
					day: refundedDay,
					workspaceId: payments.workspaceId,
					currency: payments.currency,
					amountCents: sql<string>`sum(${payments.amountCents})::text`,
				})
				.from(payments)
				.where(
					and(
						inArray(payments.workspaceId, workspaceIds),
						// 🔴 LIVE only. A sandbox payment is a test card, and counting
						// one as revenue tells an owner they earned money they did not.
						eq(payments.environment, "live"),
						gte(payments.refundedAt, range.from),
						lt(payments.refundedAt, range.to),
					),
				)
				.groupBy(sql`1`, payments.workspaceId, payments.currency),
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

	// Same merge as above, one day at a time: collections create the bucket, and a
	// refund can create one on its own when the payment it reverses is older than
	// the range.
	const days = new Map<string, OrganizationRevenue["daily"][number]>();
	const dayKey = (day: string, workspaceId: string, currency: string) =>
		`${day}:${workspaceId}:${currency}`;
	const bucket = (day: string, workspaceId: string, currency: string) => {
		const id = dayKey(day, workspaceId, currency);
		const existing = days.get(id) ?? {
			day,
			workspaceId,
			currency,
			collectedCents: 0,
			refundedCents: 0,
			netCents: 0,
		};
		days.set(id, existing);
		return existing;
	};

	for (const row of collectedDaily) {
		const entry = bucket(row.day, row.workspaceId, row.currency);
		entry.collectedCents += cents(row.amountCents);
		entry.netCents = entry.collectedCents - entry.refundedCents;
	}
	for (const row of refundedDaily) {
		const entry = bucket(row.day, row.workspaceId, row.currency);
		entry.refundedCents += cents(row.amountCents);
		entry.netCents = entry.collectedCents - entry.refundedCents;
	}

	return {
		from: range.from,
		to: range.to,
		totals: [...byCurrency.values()].sort((a, b) =>
			a.currency.localeCompare(b.currency),
		),
		workspaces,
		daily: [...days.values()].sort(
			(a, b) =>
				a.day.localeCompare(b.day) ||
				a.workspaceId.localeCompare(b.workspaceId) ||
				a.currency.localeCompare(b.currency),
		),
	};
}

/** One workspace's connection to one payment provider. */
export type OrganizationIntegration = {
	workspaceId: string;
	workspaceName: string;
	workspaceEnvironment: string;
	provider: string;
	environment: string;
	status: string;
	isDefault: boolean;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	connected: boolean;
	updatedAt: Date;
};

/**
 * Every payment connection the organization owns, workspace by workspace.
 *
 * 🔑 Connections are per WORKSPACE — one business's Stripe account is not
 * another's — but whether the company can take money is an organization-level
 * question, and answering it one workspace at a time is how a broken connection
 * goes unnoticed for a week.
 *
 * `connected` is deliberately its own field rather than left to the reader:
 * `status: "active"` with `chargesEnabled: false` is a real state, it means the
 * provider accepted onboarding and still will not take a card, and it is exactly
 * the state that looks fine on a badge and loses money in a checkout.
 */
/**
 * environment-unfiltered: a workspace may have a sandbox AND a live connection.
 *
 * Both belong on the integrations page — the point of it is seeing which of the
 * two is connected, so filtering to the current mode would hide exactly the row
 * the operator came to check.
 */
export async function listOrganizationIntegrations(
	organizationId: string,
): Promise<OrganizationIntegration[]> {
	const rows = await db
		.select({
			workspaceId: paymentAccounts.workspaceId,
			workspaceName: quickengineWorkspaces.name,
			workspaceEnvironment: quickengineWorkspaces.environment,
			provider: paymentAccounts.provider,
			environment: paymentAccounts.environment,
			status: paymentAccounts.status,
			isDefault: paymentAccounts.isDefault,
			chargesEnabled: paymentAccounts.chargesEnabled,
			payoutsEnabled: paymentAccounts.payoutsEnabled,
			externalAccountId: paymentAccounts.externalAccountId,
			updatedAt: paymentAccounts.updatedAt,
		})
		.from(paymentAccounts)
		.innerJoin(
			quickengineWorkspaces,
			eq(quickengineWorkspaces.id, paymentAccounts.workspaceId),
		)
		.where(eq(quickengineWorkspaces.organizationId, organizationId))
		.orderBy(asc(quickengineWorkspaces.name), asc(paymentAccounts.provider));

	return rows.map(({ externalAccountId, ...row }) => ({
		...row,
		// The provider's account id is a credential-adjacent identifier and the
		// control plane has no use for it. Whether one exists is the useful part.
		connected: Boolean(externalAccountId) && row.chargesEnabled,
	}));
}
