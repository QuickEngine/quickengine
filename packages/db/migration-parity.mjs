#!/usr/bin/env node
// Answers one question: has every migration committed to this repository actually
// reached the live database?
//
// This is NOT the same question `parity.mjs` answers. That one compares two
// databases' schemas and is authoritative about whether they agree TODAY. This
// one compares the repository against production, and catches the case that
// caused the 2026-07-31 outage: a migration merged, applied to Docker, and never
// applied to Neon. A schema comparison only notices that once the missing
// migration would have changed something detectable — and a developer whose
// local database is correct sees nothing wrong at all.
//
// It names the missing migrations rather than reporting a count. "Ledgers differ
// by one" is not actionable; "0046_awesome_patch has not been applied" is.
//
//   node --env-file=.env.local packages/db/migration-parity.mjs
//
// Reads NEON_DATABASE_URL. Never prints a connection string.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const LIVE = process.env.NEON_DATABASE_URL;
if (!LIVE) {
	console.error("NEON_DATABASE_URL must be set.");
	process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, "drizzle");

// The journal is drizzle's own ordered record of what it generated. Reading it
// rather than globbing `*.sql` means a stray or renamed file cannot masquerade
// as a migration.
const journal = JSON.parse(
	readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8"),
);

// Drizzle identifies an applied migration by the SHA-256 of the file's contents,
// which is why editing a migration that has already run is a mistake it cannot
// detect for you — the hash changes and the old one stays in the ledger forever.
const expected = journal.entries.map((entry) => {
	const sql = readFileSync(join(drizzleDir, `${entry.tag}.sql`), "utf8");
	return {
		tag: entry.tag,
		hash: createHash("sha256").update(sql).digest("hex"),
	};
});

const sql = postgres(LIVE, { max: 1, onnotice: () => {} });
let applied;
try {
	applied = await sql`
		select hash from drizzle.__drizzle_migrations order by created_at
	`;
} catch {
	console.error(
		"✗ Live database has no drizzle migration ledger. It has never been migrated.",
	);
	await sql.end({ timeout: 5 });
	process.exit(1);
} finally {
	await sql.end({ timeout: 5 }).catch(() => {});
}

const liveHashes = new Set(applied.map((row) => row.hash));
const missing = expected.filter((entry) => !liveHashes.has(entry.hash));
const unknown = applied.length - (expected.length - missing.length);

console.log(`repository: ${expected.length} migrations`);
console.log(`live:       ${applied.length} applied`);

// Extra rows live-side are not a failure. Production predates parts of the
// journal, and a migration that was squashed or rewritten leaves its old hash
// behind. What matters is that nothing the repository declares is absent.
if (unknown > 0) {
	console.log(
		`\nnote: ${unknown} applied migration(s) are not in the journal. Expected — ` +
			"production predates parts of it. Only missing migrations fail this check.",
	);
}

if (missing.length > 0) {
	console.error(
		`\n✗ ${missing.length} migration(s) committed but NOT applied live:`,
	);
	for (const entry of missing) console.error(`    ${entry.tag}`);
	console.error(
		"\nApply them before this ships, or production will diverge from the schema " +
			"every other environment is built from.",
	);
	process.exit(1);
}

console.log("\n✓ Every committed migration has been applied live.");
