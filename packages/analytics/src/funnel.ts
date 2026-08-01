import {
	and,
	countDistinct,
	db,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	max,
	min,
	productEvents,
	sql,
} from "@quickengine/db";
import type { ProductEventName } from "./events";

export type FunnelStep = {
	name: ProductEventName;
	/** Distinct PEOPLE, not events. One person signing up twice is one signup. */
	people: number;
	/** Share of the step before it, so the drop-off is readable at a glance. */
	conversionFromPrevious: number | null;
	/** Share of the first step, which is the number anybody actually quotes. */
	conversionFromStart: number | null;
};

const share = (part: number, whole: number): number | null =>
	whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/**
 * How many distinct people reached each step, in order.
 *
 * 🔴 **Counts people, not events.** A funnel built on event counts flatters
 * itself: one person retrying signup three times reads as three signups, and
 * the step that is broken looks like the step that is popular.
 *
 * ⚠️ It does not require the steps to have happened *in order for the same
 * person* — that is a sequence analysis, and it needs a cohort definition
 * nobody has agreed yet. What this answers is "how many people ever reached
 * each step in this window", which is the question worth asking first and is
 * honest about being that.
 */
export async function getFunnel(
	steps: ProductEventName[],
	range: { from: Date; to: Date },
): Promise<FunnelStep[]> {
	if (steps.length === 0) return [];

	const rows = await db
		.select({
			name: productEvents.name,
			// `user_id` is null before signup, so those events are counted by row.
			// Undercounting anonymous steps is the safe direction: it makes the
			// funnel look worse than reality rather than better.
			people: countDistinct(
				sql`coalesce(${productEvents.userId}, ${productEvents.id}::text)`,
			),
		})
		.from(productEvents)
		.where(
			and(
				gte(productEvents.occurredAt, range.from),
				lt(productEvents.occurredAt, range.to),
				inArray(productEvents.name, steps),
			),
		)
		.groupBy(productEvents.name);

	const counts = new Map(rows.map((row) => [row.name, Number(row.people)]));
	const start = counts.get(steps[0]) ?? 0;

	return steps.map((name, index) => {
		const people = counts.get(name) ?? 0;
		const previous = index === 0 ? people : (counts.get(steps[index - 1]) ?? 0);
		return {
			name,
			people,
			conversionFromPrevious: index === 0 ? null : share(people, previous),
			conversionFromStart: index === 0 ? null : share(people, start),
		};
	});
}

/**
 * The activation rate: of everyone who created an account, how many ever got a
 * genuinely useful outcome.
 *
 * This is the one number worth looking at before any other. If it is low,
 * retention and adoption are measuring people who never got started.
 */
export async function getActivationRate(range: {
	from: Date;
	to: Date;
}): Promise<{ signups: number; activated: number; rate: number | null }> {
	const [signups, activated] = await getFunnel(
		["signup.completed", "activation.first_outcome"],
		range,
	);
	return {
		signups: signups?.people ?? 0,
		activated: activated?.people ?? 0,
		rate: share(activated?.people ?? 0, signups?.people ?? 0),
	};
}

/**
 * Day 1, 7 and 30 retention, derived rather than recorded.
 *
 * 🔑 Any event from a person on a later day proves they returned, so no
 * `returned` event exists — recording one would mean a write on every page load
 * to answer a question the data already answers.
 *
 * "Day N" means **on or after** day N, not exactly on it. Somebody who came back
 * on day 9 was retained at day 7; requiring the exact day would report a product
 * as dead because nobody happened to open it on a Tuesday.
 */
export async function getRetention(cohort: {
	from: Date;
	to: Date;
}): Promise<{ cohortSize: number; day1: number; day7: number; day30: number }> {
	// Two builder queries and arithmetic in code, rather than one CTE through
	// `db.execute`. The raw statement is correct in isolation but does not survive
	// the driver, and a cohort is bounded by definition — nobody signs up a million
	// times in one window — so there is nothing to gain from pushing the buckets
	// into SQL and a lot to lose in debuggability.
	const signups = await db
		.selectDistinct({ userId: productEvents.userId })
		.from(productEvents)
		.where(
			and(
				eq(productEvents.name, "signup.completed"),
				isNotNull(productEvents.userId),
				gte(productEvents.occurredAt, cohort.from),
				lt(productEvents.occurredAt, cohort.to),
			),
		);

	const userIds = signups
		.map((row) => row.userId)
		.filter((id): id is string => id !== null);
	if (userIds.length === 0) {
		return { cohortSize: 0, day1: 0, day7: 0, day30: 0 };
	}

	const spans = await db
		.select({
			userId: productEvents.userId,
			firstSeen: min(productEvents.occurredAt),
			lastSeen: max(productEvents.occurredAt),
		})
		.from(productEvents)
		.where(inArray(productEvents.userId, userIds))
		.groupBy(productEvents.userId);

	const DAY = 24 * 60 * 60 * 1000;
	// "Day N" means on or AFTER day N. Requiring the exact day would report a
	// healthy product as dead because nobody happened to open it on a Tuesday.
	const retainedFor = (days: number) =>
		spans.filter((span) => {
			if (!span.firstSeen || !span.lastSeen) return false;
			return (
				new Date(span.lastSeen).getTime() -
					new Date(span.firstSeen).getTime() >=
				days * DAY
			);
		}).length;

	return {
		cohortSize: userIds.length,
		day1: retainedFor(1),
		day7: retainedFor(7),
		day30: retainedFor(30),
	};
}
