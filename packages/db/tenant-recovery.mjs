#!/usr/bin/env node
/**
 * Recover ONE workspace's data from a point in time, without touching anyone else's.
 *
 * 🔴 **Why this exists, and why a full restore is the wrong tool.** Point-in-time
 * restore is whole-database. Rolling production back to recover one customer
 * destroys every other workspace's writes in that window — it trades one
 * customer's loss for everybody's. Full rollback is only ever correct for a
 * catastrophic platform-wide event caught in the first minutes.
 *
 * The correct procedure, which this automates:
 *   1. Branch production at the chosen timestamp. Cheap, isolated, and
 *      production keeps serving traffic untouched.
 *   2. Read only the affected workspace's rows out of that branch.
 *   3. Copy them into live production (a separate, deliberate step).
 *   4. Delete the branch.
 *
 * **This script does 1, 2 and 4 — it never writes to production.** Step 3 is
 * left to a human with the extract in hand, because merging recovered rows into
 * a live database is a judgement call: some rows were legitimately deleted, some
 * were legitimately changed since, and no script can tell those apart.
 *
 *   node --env-file=.env.local packages/db/tenant-recovery.mjs <workspaceId> [hoursAgo] [--write out.json]
 *
 * Requires NEON_API_KEY and NEON_PROJECT_ID. Never prints a connection string.
 */
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
	assertPrivateOutputPath,
	formatProviderError,
	writePrivateJson,
} from "./recovery-safety.mjs";

const API = "https://console.neon.tech/api/v2";
const KEY = process.env.NEON_API_KEY;
const PROJECT = process.env.NEON_PROJECT_ID;
const REPOSITORY_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../..",
);

const args = process.argv.slice(2);
const workspaceId = args[0];
const hoursAgo = Number(args[1] ?? 2);
const writeIndex = args.indexOf("--write");
const outFile = writeIndex >= 0 ? args[writeIndex + 1] : undefined;

if (!KEY || !PROJECT) {
	console.error("NEON_API_KEY and NEON_PROJECT_ID are required.");
	process.exit(2);
}
if (!workspaceId) {
	console.error(
		"Usage: tenant-recovery.mjs <workspaceId> [hoursAgo] [--write out.json]",
	);
	process.exit(2);
}
if (writeIndex >= 0 && !outFile) {
	console.error("--write requires an output path.");
	process.exit(2);
}
if (outFile) assertPrivateOutputPath(outFile, REPOSITORY_ROOT);

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

/**
 * Every table holding this workspace's data, discovered at runtime.
 *
 * 🔴 Discovered, never hardcoded. A list in this file goes stale the first time
 * somebody adds a table, and the failure mode is silent: a recovery that looks
 * complete and quietly omits a module.
 *
 * Two kinds, and missing the second is the trap:
 *  - **Directly scoped** — has a `workspace_id` column. 43 of them today.
 *  - **Child tables** — no `workspace_id`, reachable only through a parent, like
 *    `invoice_line_items`. Recovering invoices without their line items restores
 *    an invoice with no contents and a total that matches nothing, which is worse
 *    than not restoring at all.
 */
async function discoverTables(sql) {
	const direct = (
		await sql`
			select table_name from information_schema.columns
			where table_schema = 'public' and column_name = 'workspace_id'
			order by table_name`
	).map((row) => row.table_name);

	const directSet = new Set(direct);

	const fks = await sql`
		select tc.table_name as child, kcu.column_name as child_col,
		       ccu.table_name as parent, ccu.column_name as parent_col
		from information_schema.table_constraints tc
		join information_schema.key_column_usage kcu
			on tc.constraint_name = kcu.constraint_name
		join information_schema.constraint_column_usage ccu
			on tc.constraint_name = ccu.constraint_name
		where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`;

	// One child may reference several scoped parents (an order line points at both
	// the order and the catalog item). Keep the first: any path that reaches the
	// workspace is sufficient to select the row, and joining through more than one
	// would multiply rows rather than add them.
	const children = new Map();
	for (const fk of fks) {
		if (directSet.has(fk.child) || !directSet.has(fk.parent)) continue;
		if (!children.has(fk.child)) children.set(fk.child, fk);
	}

	return { direct, children: [...children.values()] };
}

const restorePoint = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const name = `tenant-recovery-${Date.now()}`;
let branchId;

try {
	console.log(`Workspace ${workspaceId}`);
	console.log(`Branching production at ${restorePoint} (${hoursAgo}h ago)…\n`);

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

	const { direct, children } = await discoverTables(sql);
	console.log(
		`${direct.length} workspace-scoped tables, ${children.length} child tables\n`,
	);

	const extract = {};
	let total = 0;

	// 🔴 The workspace row itself. It is identified by `id`, not `workspace_id`, so
	// the discovery pass above cannot see it — and a recovery that restored a
	// workspace's contents without the workspace would restore orphans that no
	// foreign key would accept. Caught by running this for real, not by reading it.
	const [workspace] = await sql`
		select * from quickengine_workspaces where id = ${workspaceId}`;
	if (workspace) {
		extract.quickengine_workspaces = [workspace];
		total += 1;
		console.log(`  ${"quickengine_workspaces".padEnd(34)} 1`);
	} else {
		console.log(
			"  ⚠️  quickengine_workspaces        0  (workspace did not exist at this point)",
		);
	}

	for (const table of direct) {
		const rows = await sql`
			select * from ${sql(table)} where workspace_id = ${workspaceId}`;
		if (rows.length === 0) continue;
		extract[table] = rows;
		total += rows.length;
		console.log(`  ${table.padEnd(34)} ${rows.length}`);
	}

	for (const fk of children) {
		// Selected through the parent, which is the only path to the workspace.
		const rows = await sql`
			select c.* from ${sql(fk.child)} c
			join ${sql(fk.parent)} p on p.${sql(fk.parent_col)} = c.${sql(fk.child_col)}
			where p.workspace_id = ${workspaceId}`;
		if (rows.length === 0) continue;
		extract[fk.child] = rows;
		total += rows.length;
		console.log(`  ${fk.child.padEnd(34)} ${rows.length}  (via ${fk.parent})`);
	}

	await sql.end({ timeout: 5 });

	console.log(`\n${total} rows across ${Object.keys(extract).length} tables.`);

	if (total === 0) {
		console.log(
			"\n⚠️  Nothing found. Either the workspace did not exist at that point,\n" +
				"    or the id is wrong. Check before assuming data loss.",
		);
		process.exitCode = 1;
	} else if (outFile) {
		// The extract contains real customer data. It is written only when asked,
		// to a path the operator names, and belongs nowhere near the repository.
		const destination = writePrivateJson(outFile, extract, REPOSITORY_ROOT);
		console.log(`\nWritten to ${destination} with owner-only permissions.`);
		console.log(
			"⚠️  This file holds customer data. Delete it when the recovery is done.",
		);
	} else {
		console.log("\nRe-run with --write <file> to capture the rows.");
	}
} finally {
	if (branchId) {
		await api(`/projects/${PROJECT}/branches/${branchId}`, { method: "DELETE" })
			.then(() => console.log(`\nDeleted ${name}.`))
			.catch((error) => {
				console.error(`\n⚠️  Could not delete ${name}: ${error.message}`);
				process.exitCode = 1;
			});
	}
}
