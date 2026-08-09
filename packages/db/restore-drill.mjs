#!/usr/bin/env node
/**
 * Prove the production database can be restored, unattended.
 *
 * Creates a Neon branch from a past point in time, connects to it, checks that
 * schema and data actually came back, prints a verdict, and deletes the branch.
 *
 * **Why a script and not a checklist.** "We have backups" is not a claim anyone
 * should accept, including us. Almost every company has backups; far fewer have
 * ever restored one, and the gap is discovered on the worst possible day. This
 * turns the assertion into a dated, repeatable receipt — which is also what an
 * enterprise customer or an insurer asks to see.
 *
 * **What a manual run on 2026-07-26 established**, so this script does not have to
 * re-derive it:
 *  - Point-in-time restore genuinely reconstructs history rather than copying the
 *    current database. The branch reported 39 migrations where production had 43,
 *    matching the state at the chosen timestamp.
 *  - Schema restored intact: 61 tables.
 *  - **Data recovery was NOT proven** — the chosen point fell after a deliberate
 *    wipe, so there was nothing to recover. That remains open.
 *
 * Requires:
 *   NEON_API_KEY      Account Settings → API Keys
 *   NEON_PROJECT_ID   the project id from the console URL
 *
 *   node packages/db/restore-drill.mjs [hoursAgo]     # default 2
 */
import postgres from "postgres";
import { formatProviderError } from "./recovery-safety.mjs";

const API = "https://console.neon.tech/api/v2";
const KEY = process.env.NEON_API_KEY;
const PROJECT = process.env.NEON_PROJECT_ID;
const HOURS_AGO = Number(process.argv[2] ?? 2);

if (!KEY || !PROJECT) {
	console.error(
		"NEON_API_KEY and NEON_PROJECT_ID are required.\n" +
			"Account Settings → API Keys, and the project id from the console URL.",
	);
	process.exit(2);
}

const api = async (path, init = {}) => {
	const res = await fetch(`${API}${path}`, {
		...init,
		headers: {
			accept: "application/json",
			authorization: `Bearer ${KEY}`,
			"content-type": "application/json",
			...init.headers,
		},
	});
	if (!res.ok) {
		throw new Error(
			formatProviderError("Neon", init.method ?? "GET", path, res.status),
		);
	}
	return res.json();
};

const restorePoint = new Date(Date.now() - HOURS_AGO * 3_600_000).toISOString();
const name = `restore-drill-${Date.now()}`;
let branchId;

try {
	console.log(`Restoring to ${restorePoint} (${HOURS_AGO}h ago)…`);

	const created = await api(`/projects/${PROJECT}/branches`, {
		method: "POST",
		body: JSON.stringify({
			branch: { name, parent_timestamp: restorePoint },
			endpoints: [{ type: "read_write" }],
		}),
	});
	branchId = created.branch.id;

	const uri =
		created.connection_uris?.[0]?.connection_uri ??
		(
			await api(
				`/projects/${PROJECT}/connection_uri?branch_id=${branchId}&database_name=neondb&role_name=neondb_owner`,
			)
		).uri;

	// A freshly created endpoint can refuse the first connection while it starts.
	let sql;
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			sql = postgres(uri, { max: 1, onnotice: () => {} });
			await sql`select 1`;
			break;
		} catch (error) {
			if (attempt === 5) throw error;
			await sql?.end({ timeout: 5 }).catch(() => {});
			await new Promise((r) => setTimeout(r, 3000));
		}
	}

	const [{ tables }] = await sql`
		select count(*)::int as tables from information_schema.tables
		where table_schema = 'public' and table_type = 'BASE TABLE'`;
	const [{ migrations }] = await sql`
		select count(*)::int as migrations from drizzle.__drizzle_migrations`;
	const [rows] = await sql`
		select
			(select count(*)::int from quickengine_users) as users,
			(select count(*)::int from quickengine_workspaces) as workspaces,
			(select count(*)::int from quickengine_organizations) as orgs`;
	await sql.end({ timeout: 5 });

	console.log(`  tables      ${tables}`);
	console.log(`  migrations  ${migrations}`);
	console.log(`  users       ${rows.users}`);
	console.log(`  workspaces  ${rows.workspaces}`);
	console.log(`  orgs        ${rows.orgs}`);

	// Schema without data is a restore that would not save anyone. Both are required
	// for a pass, and the distinction is the whole point of running this.
	const schemaOk = tables > 50 && migrations > 0;
	const dataOk = rows.users > 0 && rows.workspaces > 0;

	if (schemaOk && dataOk) {
		console.log("\n✅ PASS — schema and data both restored.");
	} else if (schemaOk) {
		console.log(
			"\n⚠️  PARTIAL — schema restored, no data at this point in time.\n" +
				"    Either the restore point predates any data, or data recovery is broken.\n" +
				"    Re-run with a timestamp you know had records.",
		);
		process.exitCode = 1;
	} else {
		console.log("\n❌ FAIL — schema did not restore.");
		process.exitCode = 1;
	}
} finally {
	// Always, including on failure: an orphaned branch bills storage and the next
	// run should never inherit state from this one.
	if (branchId) {
		await api(`/projects/${PROJECT}/branches/${branchId}`, { method: "DELETE" })
			.then(() => console.log(`\nDeleted ${name}.`))
			.catch((error) => {
				console.error(`\n⚠️  Could not delete ${name}: ${error.message}`);
				process.exitCode = 1;
			});
	}
}
