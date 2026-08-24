import {
	and,
	CONTENT_TYPES,
	contentEntries,
	db,
	eq,
	inArray,
	sql,
} from "@quickengine/db";
import { z } from "zod";

/**
 * Named content slots for a workspace's own website.
 *
 * 🔴 Read by a STOREFRONT credential, which is public. Everything here is copy
 * intended for a public web page, so there is nothing to hide — but that also
 * means an unpublished draft must never leak, because a draft is a thing the
 * business has deliberately not said yet.
 */

const keySchema = z
	.string()
	.trim()
	.min(1)
	.max(120)
	// Dotted, lowercase, no spaces. Not parsed by us — the shape exists so keys
	// stay safe in a URL path and predictable to a developer writing them by hand.
	.regex(/^[a-z0-9][a-z0-9._-]*$/, {
		message:
			"A key is lowercase letters, numbers, dots, dashes and underscores.",
	});

/** One slot, as an operator defines it. */
export const contentEntryInputSchema = z.object({
	key: keySchema,
	type: z.enum(CONTENT_TYPES).default("text"),
	kind: z.enum(["single", "list"]).default("single"),
	// Unconstrained by design: the type says how to render it, not what it may
	// contain. A `json` slot legitimately holds anything.
	value: z.unknown().optional(),
	published: z.boolean().optional(),
	label: z.string().trim().max(160).nullable().optional(),
	description: z.string().trim().max(500).nullable().optional(),
	group: z.string().trim().max(80).nullable().optional(),
});

export type ContentEntryInput = z.infer<typeof contentEntryInputSchema>;

export type ContentEntry = {
	key: string;
	type: (typeof CONTENT_TYPES)[number];
	kind: "single" | "list";
	value: unknown;
	published: boolean;
	label: string | null;
	description: string | null;
	group: string | null;
	updatedAt: Date;
};

function toEntry(row: typeof contentEntries.$inferSelect): ContentEntry {
	return {
		key: row.key,
		type: row.type,
		kind: row.kind,
		value: row.value,
		published: row.published,
		label: row.label,
		description: row.description,
		group: row.group,
		updatedAt: row.updatedAt,
	};
}

/**
 * Every slot a website may render.
 *
 * 🔴 Published only, and that filter is in the WHERE clause rather than applied
 * after — an unpublished draft must not travel to a public page even briefly.
 *
 * Returned as a map keyed by slot name, because that is how a template consumes
 * it: `content["about.body"]`. A list would make every caller build this map.
 */
export async function listPublishedContent(
	workspaceId: string,
): Promise<Record<string, unknown>> {
	const rows = await db
		.select()
		.from(contentEntries)
		.where(
			and(
				eq(contentEntries.workspaceId, workspaceId),
				eq(contentEntries.published, true),
			),
		);

	const map: Record<string, unknown> = {};
	for (const row of rows) map[row.key] = row.value;
	return map;
}

/** One published slot, or null. Used when a page needs a single value. */
export async function getPublishedContent(
	workspaceId: string,
	key: string,
): Promise<unknown | null> {
	const [row] = await db
		.select({ value: contentEntries.value })
		.from(contentEntries)
		.where(
			and(
				eq(contentEntries.workspaceId, workspaceId),
				eq(contentEntries.key, key),
				eq(contentEntries.published, true),
			),
		)
		.limit(1);
	return row ? row.value : null;
}

/**
 * Every slot, published or not, for the operator's editing form.
 *
 * Operator-authenticated. This is the only place a draft is visible.
 */
export async function listAllContent(
	workspaceId: string,
): Promise<ContentEntry[]> {
	const rows = await db
		.select()
		.from(contentEntries)
		.where(eq(contentEntries.workspaceId, workspaceId));
	// Grouped then alphabetical, so the form reads as sections rather than as a
	// flat dump in insertion order.
	return rows
		.map(toEntry)
		.sort(
			(a, b) =>
				(a.group ?? "").localeCompare(b.group ?? "") ||
				a.key.localeCompare(b.key),
		);
}

/**
 * Create or update a slot.
 *
 * Upsert by `(workspace, key)` because a developer re-registering a site's slot
 * manifest must not duplicate anything, and an operator saving twice must not
 * either.
 *
 * ⚠️ Only the fields present are written. A manifest registration that omits
 * `value` must not blank out what the operator already typed — which is the
 * failure that makes a slot system infuriating to use.
 */
export async function upsertContentEntry(
	workspaceId: string,
	input: ContentEntryInput,
	options: { publishOnSave?: boolean; seedOnly?: boolean } = {},
): Promise<ContentEntry> {
	const parsed = contentEntryInputSchema.parse(input);
	const now = new Date();

	const published =
		parsed.published ?? (options.publishOnSave ? true : undefined);

	const [row] = await db
		.insert(contentEntries)
		.values({
			workspaceId,
			key: parsed.key,
			type: parsed.type,
			kind: parsed.kind,
			value: parsed.value ?? null,
			/**
			 * 🔴 A SEEDED slot is published immediately; an empty one is not.
			 *
			 * The seed is the copy the site is ALREADY rendering from its own code, so
			 * publishing it changes nothing a visitor can see. Leaving it unpublished
			 * would mean the public read returns nothing, every slot needs a manual
			 * publish before the site matches what it showed yesterday, and the CMS
			 * appears broken on the day it is switched on.
			 *
			 * ⚠️ A slot seeded EMPTY stays unpublished — there is nothing to show, and
			 * publishing a blank is how a headline disappears.
			 */
			published:
				published ?? (options.seedOnly ? Boolean(parsed.value) : false),
			label: parsed.label ?? null,
			description: parsed.description ?? null,
			group: parsed.group ?? null,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [contentEntries.workspaceId, contentEntries.key],
			set: {
				type: parsed.type,
				kind: parsed.kind,
				/**
				 * Undefined means "not supplied" and leaves the stored value alone.
				 *
				 * 🔴 `seedOnly` means "supplied, but only as a STARTING POINT" — take
				 * it if the slot is EMPTY, keep what is there otherwise.
				 *
				 * ⚠️ Emptiness, not newness. Seeding only on INSERT looks equivalent
				 * and is not: a slot registered before anybody wrote anything already
				 * exists with a null value, so the insert never runs again and it
				 * stays blank for ever. `coalesce` is the difference, and a test
				 * caught it.
				 *
				 * That is what lets a site ship the copy it already has hardcoded as
				 * the initial value — the operator opens Content and sees their real
				 * words instead of a column of empty boxes they cannot identify —
				 * while a redeploy re-registering the same manifest can never
				 * overwrite what they have since written.
				 *
				 * 🔑 Literal SQL, no interpolated columns. `${contentEntries.value}`
				 * would emit a BARE `"value"`, which is ambiguous between the target
				 * row and `excluded` — the same trap that took the orders list down
				 * with `column reference "id" is ambiguous`.
				 */
				...(parsed.value === undefined
					? {}
					: options.seedOnly
						? {
								value: sql`coalesce(content_entries.value, excluded.value)`,
							}
						: { value: parsed.value }),
				/**
				 * 🔑 Publish ONLY the slot this registration actually filled.
				 *
				 * `content_entries.value` is the value BEFORE this update, so "was null"
				 * means the coalesce above just took the seed. Anything the operator had
				 * already written keeps whatever publish state they chose — including a
				 * deliberate draft, which a redeploy must never push live.
				 */
				...(published !== undefined
					? { published }
					: options.seedOnly && parsed.value
						? {
								published: sql`case when content_entries.value is null then true else content_entries.published end`,
							}
						: {}),
				...(parsed.label !== undefined ? { label: parsed.label } : {}),
				...(parsed.description !== undefined
					? { description: parsed.description }
					: {}),
				...(parsed.group !== undefined ? { group: parsed.group } : {}),
				updatedAt: now,
			},
		})
		.returning();

	return toEntry(row);
}

/**
 * Register a site's slots in one call.
 *
 * 🔴 The agency path. A developer building a client's site declares every
 * editable slot once, and the operator's form appears already populated with
 * labels and groups instead of being empty until somebody invents keys.
 *
 * Existing values survive, because a redeploy of a site must never wipe the
 * words its owner wrote.
 */
export async function registerContentManifest(
	workspaceId: string,
	slots: readonly ContentEntryInput[],
	options: { publishOnSave?: boolean } = {},
): Promise<{ registered: number }> {
	for (const slot of slots) {
		/**
		 * 🔴 A manifest declares SHAPE, and may seed a STARTING VALUE.
		 *
		 * It used to strip the value entirely, so that redeploying a site could
		 * never wipe the words its owner had written. That reasoning was right and
		 * the consequence was wrong: the operator opened Content to a column of
		 * empty boxes with no way to tell which was which, and no idea what any of
		 * them currently said on the site.
		 *
		 * `seedOnly` keeps the protection and removes the problem — the value is
		 * used when the slot is FIRST created and ignored on every registration
		 * afterwards. A site can therefore ship the copy it already has hardcoded,
		 * the operator sees their real words on day one, and the next deploy
		 * cannot clobber their edits.
		 */
		await upsertContentEntry(workspaceId, slot, {
			...options,
			seedOnly: true,
		});
	}
	return { registered: slots.length };
}

/** Publish or unpublish, without touching the words. */
export async function setContentPublished(
	workspaceId: string,
	keys: readonly string[],
	published: boolean,
): Promise<number> {
	if (keys.length === 0) return 0;
	const rows = await db
		.update(contentEntries)
		.set({ published, updatedAt: new Date() })
		.where(
			and(
				eq(contentEntries.workspaceId, workspaceId),
				inArray(contentEntries.key, [...keys]),
			),
		)
		.returning({ key: contentEntries.key });
	return rows.length;
}

/**
 * Delete a slot.
 *
 * Removes the definition, not just the value. Used when a site stops using a
 * slot — leaving orphans means the operator's form fills with fields that
 * change nothing, which is how these systems rot.
 */
export async function deleteContentEntry(
	workspaceId: string,
	key: string,
): Promise<boolean> {
	const rows = await db
		.delete(contentEntries)
		.where(
			and(
				eq(contentEntries.workspaceId, workspaceId),
				eq(contentEntries.key, key),
			),
		)
		.returning({ key: contentEntries.key });
	return rows.length > 0;
}

/**
 * A whole site's slot declarations, in one request.
 *
 * Lives here rather than in the route so the OpenAPI document and the handler
 * cannot drift — they import the same object.
 */
export const contentManifestInputSchema = z.object({
	slots: z.array(contentEntryInputSchema).min(1).max(500),
});

/** Publishing or unpublishing a set of slots, without touching their values. */
export const contentPublishInputSchema = z.object({
	keys: z.array(z.string().trim().min(1)).min(1).max(500),
	published: z.boolean(),
});
