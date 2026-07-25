import { getTableColumns, type Table } from "drizzle-orm";
import { z } from "zod";

/**
 * Response schemas derived from the tables the serializers read.
 *
 * The API returns a serialized row: every column, with `Date` rendered as an ISO
 * string. `tableResponse` reproduces exactly that, so the document describes what
 * the code returns rather than a hand-written guess that drifts.
 *
 * **Two properties make this safe to publish.**
 *
 * 1. It is only used for serializers that genuinely return the whole row. Anything
 *    that withholds a field — the webhook endpoint's signing secret, for instance —
 *    declares its schema explicitly instead. Using this helper there would publish
 *    the withheld field.
 * 2. Every schema is checked against its DTO type at compile time by `Exact` below,
 *    so a column added to a table, or a field dropped from a DTO, fails the build
 *    until the document is updated.
 */

/** A serialized row: dates become ISO strings, everything else passes through. */
export type Serialized<T> = {
	[K in keyof T]: T[K] extends Date
		? string
		: T[K] extends Date | null
			? string | null
			: T[K];
};

/**
 * Compile-time proof that two object types carry exactly the same keys.
 *
 * Assigning `true` to `ExactKeys<A, B>` fails unless the key sets match in both
 * directions. That is what guards the two failures worth guarding:
 *
 * - a column added to a table but missing from the DTO (or vice versa) — the
 *   document silently going stale;
 * - a field the DTO deliberately withholds appearing in the schema — the document
 *   advertising a secret.
 *
 * **Value types are checked structurally where they can be, and deliberately not
 * where they cannot.** A `jsonb` column carries its shape only as a compile-time
 * `$type<…>` refinement, which `getTableColumns` cannot see at runtime, so those
 * fields are documented as objects with string keys. That is honest — the field
 * exists and is an object — rather than a fabricated shape.
 */
export type ExactKeys<A, B> = [keyof A] extends [keyof B]
	? [keyof B] extends [keyof A]
		? true
		: false
	: false;

/** Column data types Drizzle reports, mapped to what JSON actually carries. */
function columnSchema(column: {
	dataType: string;
	notNull: boolean;
	columnType: string;
}): z.ZodType {
	let base: z.ZodType;
	switch (column.dataType) {
		case "number":
			base = z.number();
			break;
		case "boolean":
			base = z.boolean();
			break;
		case "date":
			// Serialized before it leaves the API — never a Date on the wire.
			base = z.string().meta({ format: "date-time" });
			break;
		case "json":
			base = z.record(z.string(), z.unknown());
			break;
		case "array":
			base = z.array(z.unknown());
			break;
		default:
			base = z.string();
	}
	return column.notNull ? base : base.nullable();
}

/**
 * The response shape for a serializer that returns the full row.
 *
 * The cast is deliberate and narrow: the runtime builds one property per column,
 * and `Serialized<T>` states precisely that. Each call site then proves the result
 * matches its DTO via `Exact`, so the claim is verified where it is used rather
 * than trusted here.
 */
export function tableResponse<T extends Table>(
	table: T,
): z.ZodType<Serialized<T["$inferSelect"]>> {
	const shape: Record<string, z.ZodType> = {};
	for (const [name, column] of Object.entries(getTableColumns(table))) {
		shape[name] = columnSchema(
			column as unknown as {
				dataType: string;
				notNull: boolean;
				columnType: string;
			},
		);
	}
	return z.object(shape) as unknown as z.ZodType<Serialized<T["$inferSelect"]>>;
}
