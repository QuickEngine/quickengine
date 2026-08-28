#!/usr/bin/env node
/**
 * Take a verified backup of a QuickEngine database.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 The hosted database has NO automatic backups. Neon's branch-based
 * point-in-time recovery is what `restore-drill.mjs` and `tenant-recovery.mjs`
 * were built around, and moving off it took that away without replacing it. A
 * dropped table or a bad `DELETE` is currently unrecoverable, which is a worse
 * risk than anything the application code can do to itself.
 *
 * ── Why it verifies rather than just writing a file ──────────────────────────
 *
 * ⚠️ An unverified backup is a guess. `pg_dump` can exit 0 having written
 * something `pg_restore` will not read — a version mismatch is the usual cause —
 * and the first time anybody finds out is the day it is needed. So every run
 * reads its own output back and refuses to keep a dump it cannot list.
 *
 * ── Version handling ─────────────────────────────────────────────────────────
 *
 * 🔑 `pg_dump` must be at least the server's major version. A v14 client against
 * a v17 server writes an archive that v14 cannot read back. Rather than making
 * that a documented footgun, this detects the mismatch and runs the matching
 * `pg_dump` in Docker instead.
 *
 * Usage:
 *   node packages/db/backup.mjs --out ~/backups/quickengine
 *   node packages/db/backup.mjs --out ~/backups/quickengine --url "$SUPABASE_SESSION_URL"
 *   node packages/db/backup.mjs --out ~/backups/quickengine --keep 30
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateOutputPath } from "./recovery-safety.mjs";

const REPOSITORY_ROOT = resolve(
	fileURLToPath(new URL("../..", import.meta.url)),
);

const arg = (name) => {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
};

const fail = (message) => {
	console.error(`\n  ✗ ${message}\n`);
	process.exit(1);
};

/**
 * ⚠️ The SESSION pooler or a direct connection, never the transaction pooler.
 *
 * `pg_dump` needs a stable session: it sets parameters and holds a repeatable
 * read snapshot across many statements, and a transaction pooler can hand those
 * statements to different backends.
 */
const url =
	arg("url") ?? process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) fail("No database URL. Pass --url, or set BACKUP_DATABASE_URL.");
if (new URL(url).port === "6543") {
	fail(
		"That is a transaction pooler (:6543). pg_dump needs a stable session — use the session pooler (:5432) or a direct connection.",
	);
}

const outDir = arg("out");
if (!outDir) fail("No output directory. Pass --out <directory>.");
const keep = Number.parseInt(arg("keep") ?? "14", 10);
if (!Number.isFinite(keep) || keep < 1)
	fail("--keep must be a positive number.");

mkdirSync(resolve(outDir), { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
let target;
try {
	target = assertPrivateOutputPath(
		join(resolve(outDir), `quickengine-${stamp}.dump`),
		REPOSITORY_ROOT,
	);
} catch (error) {
	fail(String(error.message));
}

/** What the server is, so the dump client can be matched to it. */
function serverMajor() {
	const out = spawnSync("psql", [url, "-tAc", "show server_version_num"], {
		encoding: "utf8",
	});
	if (out.status !== 0) {
		fail(
			`Could not reach the database: ${(out.stderr || "").trim().slice(0, 200)}`,
		);
	}
	return Math.floor(Number.parseInt(out.stdout.trim(), 10) / 10000);
}

function localMajor() {
	const out = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
	if (out.status !== 0) return 0;
	const match = out.stdout.match(/(\d+)\./);
	return match ? Number.parseInt(match[1], 10) : 0;
}

const server = serverMajor();
const local = localMajor();
const useDocker = local < server;

console.log(`  server postgres ${server} · local pg_dump ${local || "none"}`);
if (useDocker) {
	console.log(
		`  using docker postgres:${server}-alpine (local client is too old)`,
	);
}

/**
 * 🔴 Only OUR schemas.
 *
 * A hosted provider keeps its own tables in the same database — Supabase has
 * `auth`, `storage`, `realtime` and `vault`, 38 tables that belong to the
 * platform rather than to QuickEngine. Dumping them makes the archive bigger,
 * leaks the provider's shape into our backup, and above all makes it refuse to
 * restore cleanly anywhere else. Being able to LEAVE is the point of taking the
 * backup, so the dump carries only what QuickEngine owns.
 */
const OUR_SCHEMAS = ["--schema=public", "--schema=drizzle"];

try {
	if (useDocker) {
		execFileSync(
			"docker",
			[
				"run",
				"--rm",
				"-i",
				"-v",
				`${resolve(outDir)}:/out`,
				`postgres:${server}-alpine`,
				"pg_dump",
				"--format=custom",
				"--no-owner",
				"--no-acl",
				...OUR_SCHEMAS,
				"--file",
				`/out/${target.split("/").at(-1)}`,
				url,
			],
			{ stdio: ["ignore", "inherit", "pipe"] },
		);
	} else {
		execFileSync(
			"pg_dump",
			[
				"--format=custom",
				"--no-owner",
				"--no-acl",
				...OUR_SCHEMAS,
				"--file",
				target,
				url,
			],
			{ stdio: ["ignore", "inherit", "pipe"] },
		);
	}
} catch (error) {
	fail(
		`pg_dump failed: ${String(error.stderr ?? error.message).slice(0, 300)}`,
	);
}

// Owner-only: a dump is every customer's data in one file.
chmodSync(target, 0o600);

/**
 * 🔴 Read it back. An archive that cannot be listed cannot be restored, and a
 * backup nobody has opened is a rumour.
 */
let tables = 0;
try {
	const list = useDocker
		? execFileSync(
				"docker",
				[
					"run",
					"--rm",
					"-v",
					`${resolve(outDir)}:/out`,
					`postgres:${server}-alpine`,
					"pg_restore",
					"--list",
					`/out/${target.split("/").at(-1)}`,
				],
				{ encoding: "utf8" },
			)
		: execFileSync("pg_restore", ["--list", target], { encoding: "utf8" });
	tables = list
		.split("\n")
		.filter((line) => line.includes("TABLE DATA")).length;
} catch (error) {
	unlinkSync(target);
	fail(
		`The dump could not be read back and has been deleted rather than kept as a false reassurance: ${String(error.message).slice(0, 200)}`,
	);
}

if (tables === 0) {
	unlinkSync(target);
	fail("The dump contains no table data. Deleted rather than kept.");
}

const bytes = statSync(target).size;
console.log(`  ✓ ${target}`);
console.log(
	`    ${tables} tables · ${(bytes / 1024 / 1024).toFixed(1)} MB · verified readable`,
);

/**
 * ⚠️ Prune AFTER a successful verified write, never before.
 *
 * Deleting old backups first would mean a failing run destroys the only copies
 * it had, which is the opposite of what a backup script is for.
 */
const existing = readdirSync(resolve(outDir))
	.filter((name) => /^quickengine-.*\.dump$/.test(name))
	.sort()
	.reverse();
for (const stale of existing.slice(keep)) {
	unlinkSync(join(resolve(outDir), stale));
	console.log(`    pruned ${stale}`);
}
console.log(
	`    keeping ${Math.min(existing.length, keep)} of ${existing.length}\n`,
);
