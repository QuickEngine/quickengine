#!/usr/bin/env node
// Compares the local Docker database against Neon so the two can never quietly drift.
// Reads DATABASE_URL (local) and NEON_DATABASE_URL (live) from the environment; never prints
// a connection string. Exits non-zero when the schemas disagree.
//
//   node --env-file=.env.local scripts/db-parity.mjs
import process from "node:process";
import postgres from "postgres";

const LOCAL = process.env.DATABASE_URL;
const LIVE = process.env.NEON_DATABASE_URL;

if (!LOCAL || !LIVE) {
	console.error(
		"Both DATABASE_URL (local) and NEON_DATABASE_URL (live) must be set.",
	);
	process.exit(2);
}

const inspect = async (url, label) => {
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		const tables = await sql`
			select table_name from information_schema.tables
			where table_schema = 'public' order by table_name
		`;
		const columns = await sql`
			select table_name || '.' || column_name as ref
			from information_schema.columns
			where table_schema = 'public' order by ref
		`;
		const indexes = await sql`
			select indexname from pg_indexes
			where schemaname = 'public' order by indexname
		`;
		let migrations = [];
		try {
			migrations = await sql`
				select hash from drizzle.__drizzle_migrations order by created_at
			`;
		} catch {
			// A database that has never been migrated has no drizzle schema at all.
		}
		return {
			label,
			tables: new Set(tables.map((r) => r.table_name)),
			columns: new Set(columns.map((r) => r.ref)),
			indexes: new Set(indexes.map((r) => r.indexname)),
			migrations: migrations.length,
		};
	} finally {
		await sql.end({ timeout: 5 });
	}
};

const difference = (a, b) => [...a].filter((value) => !b.has(value));

const [local, live] = await Promise.all([
	inspect(LOCAL, "local"),
	inspect(LIVE, "live"),
]);

const problems = [];
const report = (title, values) => {
	if (!values.length) return;
	problems.push(`${title} (${values.length})`);
	for (const value of values.slice(0, 40)) console.error(`    ${value}`);
	if (values.length > 40) console.error(`    …and ${values.length - 40} more`);
};

console.log(
	`local: ${local.tables.size} tables, ${local.migrations} migrations applied`,
);
console.log(
	`live:  ${live.tables.size} tables, ${live.migrations} migrations applied`,
);

report("Tables only in local", difference(local.tables, live.tables));
report("Tables only in live", difference(live.tables, local.tables));
// Column drift only matters for tables both sides have; a missing table already reported above.
const shared = [...local.tables].filter((t) => live.tables.has(t));
const scoped = (set) =>
	new Set([...set].filter((ref) => shared.includes(ref.split(".")[0])));
report(
	"Columns only in local",
	difference(scoped(local.columns), scoped(live.columns)),
);
report(
	"Columns only in live",
	difference(scoped(live.columns), scoped(local.columns)),
);
report("Indexes only in local", difference(local.indexes, live.indexes));
report("Indexes only in live", difference(live.indexes, local.indexes));

// Migration counts are reported but never fail the check: the two databases were
// bootstrapped differently (production predates parts of the journal), so their ledgers
// aren't comparable one-to-one even when the schema agrees. The schema is the truth.
if (local.migrations !== live.migrations) {
	console.log(
		`\nnote: migration ledgers differ (local ${local.migrations}, live ${live.migrations}). ` +
			"Expected — they were bootstrapped differently. Schema comparison above is authoritative.",
	);
}

if (problems.length) {
	console.error(`\n✗ Databases have drifted:\n  - ${problems.join("\n  - ")}`);
	process.exit(1);
}
console.log("\n✓ Local and live schemas match.");
