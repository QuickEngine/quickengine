import {
	and,
	asc,
	db,
	eq,
	gte,
	lt,
	payments,
	reportingTrafficEvents,
	sql,
} from "@quickengine/db";
import { type ReportRangeInput, reportRangeInputSchema } from "./range";

export async function getRevenueSeries(
	workspaceId: string,
	input: ReportRangeInput,
) {
	const range = reportRangeInputSchema.parse(input);
	const collectedBucket = sql<string>`date_trunc(${range.granularity}, timezone(${range.timeZone}, ${payments.succeededAt}))::text`;
	const refundedBucket = sql<string>`date_trunc(${range.granularity}, timezone(${range.timeZone}, ${payments.refundedAt}))::text`;
	const [collected, refunded] = await Promise.all([
		db
			.select({
				bucket: collectedBucket,
				currency: payments.currency,
				count: sql<number>`count(*)::int`,
				amountCents: sql<string>`sum(${payments.amountCents})::text`,
			})
			.from(payments)
			.where(
				and(
					eq(payments.workspaceId, workspaceId),
					gte(payments.succeededAt, range.from),
					lt(payments.succeededAt, range.to),
				),
			)
			.groupBy(sql`1`, payments.currency)
			.orderBy(sql`1 asc`, asc(payments.currency)),
		db
			.select({
				bucket: refundedBucket,
				currency: payments.currency,
				count: sql<number>`count(*)::int`,
				amountCents: sql<string>`sum(${payments.amountCents})::text`,
			})
			.from(payments)
			.where(
				and(
					eq(payments.workspaceId, workspaceId),
					gte(payments.refundedAt, range.from),
					lt(payments.refundedAt, range.to),
				),
			)
			.groupBy(sql`1`, payments.currency)
			.orderBy(sql`1 asc`, asc(payments.currency)),
	]);
	return { collected, refunded };
}

export async function getTrafficSeries(
	workspaceId: string,
	input: ReportRangeInput,
) {
	const range = reportRangeInputSchema.parse(input);
	const bucket = sql<string>`date_trunc(${range.granularity}, timezone(${range.timeZone}, ${reportingTrafficEvents.occurredAt}))::text`;
	return db
		.select({
			bucket,
			pageViews: sql<number>`count(*)::int`,
			visitors: sql<number>`count(distinct ${reportingTrafficEvents.visitorHash})::int`,
			sessions: sql<number>`count(distinct ${reportingTrafficEvents.sessionHash})::int`,
		})
		.from(reportingTrafficEvents)
		.where(
			and(
				eq(reportingTrafficEvents.workspaceId, workspaceId),
				gte(reportingTrafficEvents.occurredAt, range.from),
				lt(reportingTrafficEvents.occurredAt, range.to),
			),
		)
		.groupBy(sql`1`)
		.orderBy(sql`1 asc`);
}
