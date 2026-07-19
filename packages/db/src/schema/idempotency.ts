import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Server-side idempotency for mutations. The client sends a per-intent key with a create;
// the server atomically claims it here (INSERT … ON CONFLICT DO NOTHING), so a retry, a race,
// or two tabs submitting the same form can't produce a duplicate — only the request that wins
// the insert does the work. `scope` records what the key was for (e.g. "client-records.create")
// so keys are legible and could be pruned by age/scope later.
export const mutationIdempotency = pgTable("mutation_idempotency", {
	// The client-generated key (a UUID), globally unique — the primary key is the guarantee.
	key: text("key").primaryKey(),
	scope: text("scope").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});
