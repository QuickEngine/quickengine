#!/usr/bin/env node
/**
 * Prove the production database can be restored, unattended.
 *
 * Takes a real backup with `backup.mjs`, restores it into a throwaway database,
 * and reconciles the row count of EVERY table against the source. Prints a
 * verdict and a duration, then deletes both the dump and the scratch database.
 *
 * **Why a script and not a checklist.** "We have backups" is not a claim anyone
 * should accept, including us. Almost every company has backups; far fewer have
 * ever restored one, and the gap is found on the worst possible day. This turns
 * the assertion into a dated, repeatable receipt, which is also what an
 * enterprise customer or an insurer asks to see.
 *
 * 🔴 **Rewritten 2026-09-06, and the reason matters.** The previous version drove
 * Neon's point-in-time branch API and needed `NEON_API_KEY`. Production moved to
 * Supabase and the Neon project was deleted, so the drill could no longer run
 * against the database holding customer data — it had been silently untestable
 * since the migration, which is the exact failure this script exists to prevent.
 *
 * ⚠️ It now tests the ARTEFACT rather than a provider feature: the same dump
 * `backup.mjs` writes is the thing restored. That is stronger, because it proves
 * the file we actually keep can bring the business back, and it works against any
 * Postgres, which is the point of being able to leave a provider.
 *
 *   node packages/db/restore-drill.mjs --source <url> --scratch <admin url>
 *
 *   --source    the database to prove. READ ONLY; never written to.
 *   --scratch   an admin connection on a DIFFERENT host where a temporary
 *               database can be created and dropped. Local Docker is the
 *               intended answer.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name) => {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
};

const fail = (message) => {
	console.error(`\n✗ ${message}\n`);
	process.exit(1);
};

const source = arg("source") ?? process.env.RESTORE_SOURCE_URL;
const scratch = arg("scratch") ?? process.env.RESTORE_SCRATCH_URL;
if (!source) fail("No --source database URL.");
if (!scratch) fail("No --scratch admin URL.");

/**
 * 🔴 The guard that makes this safe to run against production.
 *
 * The drill restores, which means it WRITES. Pointing both ends at the same host
 * would restore production over itself. Hosts must differ, and there is no flag
 * to override it: an accidental match is never a thing somebody meant.
 */
const parse = (url) => {
	try {
		const u = new URL(url);
		return { host: u.host, db: u.pathname.replace(/^\//, "") };
	} catch {
		return null;
	}
};
const hostOf = (url) => parse(url)?.host ?? null;
const from = parse(source);
const to = parse(scratch);
if (!from || !to) fail("A URL could not be parsed.");

/**
 * ⚠️ Host AND database, not host alone. Restoring into a different database on
 * the same server is the normal way to rehearse locally; restoring into the one
 * being proven is the accident. An earlier version compared hosts only and made
 * the safe case impossible, which would have pushed anyone testing it towards
 * disabling the check.
 */
if (from.host === to.host && from.db === to.db) {
	fail(
		`--source and --scratch are the same database (${from.host}/${from.db}). ` +
			"Restoring into the database being proven would destroy it.",
	);
}

const psql = (url, sql) => {
	const out = spawnSync("psql", [url, "-tAc", sql], { encoding: "utf8" });
	if (out.status !== 0) {
		fail(`psql failed: ${(out.stderr || "").trim().slice(0, 300)}`);
	}
	return out.stdout.trim();
};

/** Row counts for every table we own, as the comparison the verdict rests on. */
const countsFor = (url) => {
	const sql = `
		SELECT string_agg(format('%I.%I=%s', schemaname, relname, n_live_tup), E'\\n' ORDER BY schemaname, relname)
		FROM pg_stat_user_tables WHERE schemaname IN ('public','drizzle')`;
	const exact = `
		SELECT string_agg(t, E'\\n' ORDER BY t) FROM (
			SELECT format('%I.%I=%s', table_schema, table_name,
				(xpath('/row/c/text()', query_to_xml(
					format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
					false, true, '')))[1]::text::bigint) AS t
			FROM information_schema.tables
			WHERE table_schema IN ('public','drizzle') AND table_type = 'BASE TABLE'
		) s`;
	// `pg_stat_user_tables` is an estimate; the drill needs the real number, so
	// the estimate is only a fallback if the exact query is refused.
	const rows = psql(url, exact) || psql(url, sql);
	const map = new Map();
	for (const line of rows.split("\n").filter(Boolean)) {
		const [name, count] = line.split("=");
		map.set(name, Number(count));
	}
	return map;
};

const started = Date.now();
const workDir = mkdtempSync(join(tmpdir(), "quickengine-drill-"));
const scratchDb = `drill_${Date.now()}`;
const adminUrl = new URL(scratch);
const scratchUrl = new URL(scratch);
scratchUrl.pathname = `/${scratchDb}`;

let created = false;
try {
	console.log(`\n  source   ${hostOf(source)}`);
	console.log(`  scratch  ${hostOf(scratch)}/${scratchDb}\n`);

	console.log("  1. counting the source");
	const before = countsFor(source);
	console.log(`     ${before.size} tables`);

	console.log("  2. taking a real backup");
	const backupScript = fileURLToPath(new URL("./backup.mjs", import.meta.url));
	execFileSync(
		"node",
		[backupScript, "--url", source, "--out", workDir, "--keep", "1"],
		{ stdio: "inherit" },
	);
	const dump = readdirSync(workDir).find((f) => f.endsWith(".dump"));
	if (!dump) fail("The backup produced no dump file.");

	console.log("  3. creating the scratch database");
	psql(adminUrl.toString(), `CREATE DATABASE ${scratchDb}`);
	created = true;

	console.log("  4. restoring");
	/**
	 * 🔴 The client must be at least the server's major version, exactly as in
	 * `backup.mjs`. A v14 `pg_restore` against a v17 custom-format dump does not
	 * refuse loudly: it restored NOTHING and exited in a way that looked survivable,
	 * and the drill only caught it because reconciliation counts rows rather than
	 * trusting the exit code. Reuse the same Docker fallback, and the same
	 * `host.docker.internal` mapping, since the scratch database is usually local.
	 */
	const serverMajor = Number(psql(adminUrl.toString(), "show server_version_num")) / 10000;
	const restoreLocal = spawnSync("pg_restore", ["--version"], { encoding: "utf8" });
	const localMajor = restoreLocal.status === 0
		? Number((restoreLocal.stdout.match(/(\d+)\./) ?? [0, 0])[1])
		: 0;
	const viaDocker = localMajor < Math.floor(serverMajor);

	const inContainer = (u) => {
		const parsed = new URL(u);
		if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
			parsed.hostname = "host.docker.internal";
		}
		return parsed.toString();
	};

	const restore = viaDocker
		? spawnSync("docker", [
				"run", "--rm", "-i",
				"--add-host", "host.docker.internal:host-gateway",
				"-v", `${workDir}:/dump`,
				`postgres:${Math.floor(serverMajor)}-alpine`,
				"pg_restore", "--dbname", inContainer(scratchUrl.toString()),
				"--no-owner", "--no-privileges", `/dump/${dump}`,
			], { encoding: "utf8" })
		: spawnSync("pg_restore", [
				"--dbname", scratchUrl.toString(),
				"--no-owner", "--no-privileges", join(workDir, dump),
			], { encoding: "utf8" });

	// ⚠️ A non-zero exit is reported but does not decide the verdict: pg_restore
	// warns about extensions that already exist and roles that do not. The row
	// reconciliation below is the actual test.
	if (restore.status !== 0) {
		const detail = (restore.stderr || "").trim().split("\n").slice(-3).join(" · ");
		console.log(`     pg_restore warnings (exit ${restore.status}): ${detail.slice(0, 200)}`);
	}

	console.log("  5. reconciling every table");
	const after = countsFor(scratchUrl.toString());

	const problems = [];
	for (const [table, count] of before) {
		const got = after.get(table);
		if (got === undefined) problems.push(`${table}: MISSING after restore`);
		else if (got !== count) problems.push(`${table}: ${count} → ${got}`);
	}
	const extra = [...after.keys()].filter((t) => !before.has(t));

	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	console.log(`\n  tables   ${before.size} source · ${after.size} restored`);
	console.log(`  rows     ${[...before.values()].reduce((a, b) => a + b, 0)}`);
	console.log(`  elapsed  ${seconds}s\n`);

	if (problems.length) {
		console.log("  mismatches:");
		for (const p of problems.slice(0, 20)) console.log(`    ${p}`);
		fail(`${problems.length} table(s) did not come back identical.`);
	}
	if (extra.length) console.log(`  note: ${extra.length} table(s) only in the restore`);

	console.log(`✓ PASS — every table restored with identical row counts in ${seconds}s.`);
	console.log("  That number is the one an incident update has to contain.\n");
} finally {
	// 🔴 The dump is real customer data. It does not outlive the drill.
	rmSync(workDir, { recursive: true, force: true });
	if (created) {
		spawnSync("psql", [adminUrl.toString(), "-tAc", `DROP DATABASE IF EXISTS ${scratchDb}`]);
	}
}
