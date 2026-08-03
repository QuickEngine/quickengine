#!/usr/bin/env node
// `db:push`, with a guard.
//
// 🔴 `drizzle-kit push` reshapes whatever database DATABASE_URL names. It takes
// no confirmation, keeps no migration record, and will happily drop a column on
// production if that is what makes the schema match. It is a LOCAL development
// tool that happens to accept a remote URL.
//
// The README used to warn about this in prose — "DATABASE_URL may point at
// production, point it at Docker first" — which documented the footgun instead
// of removing it, in a public file, while advertising that a production URL sits
// in every developer's local env by default.
//
// Production schema changes go through `db:migrate`: reviewed, recorded in the
// journal, and checked by `db:migration-parity`. That is the path. This is not.
//
//   pnpm db:push                  # localhost only
//   pnpm db:push --allow-remote   # deliberate, and you will be asked to confirm
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const allowRemote = args.includes("--allow-remote");
const passthrough = args.filter((arg) => arg !== "--allow-remote");

// Same source drizzle.config.ts reads, so the guard cannot check one URL while
// drizzle pushes to another.
function fromEnvLocal(key) {
	// This file sits at packages/db/, not packages/db/scripts/ — that directory
	// is git-excluded for the local-only tooling, and a guard that cannot be
	// committed guards nobody's clone but your own.
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
	try {
		const text = readFileSync(resolve(root, ".env.local"), "utf8");
		const line = text.split("\n").find((l) => l.trim().startsWith(`${key}=`));
		if (!line) return undefined;
		let value = line.slice(line.indexOf("=") + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		return value || undefined;
	} catch {
		return undefined;
	}
}

const url = process.env.DATABASE_URL ?? fromEnvLocal("DATABASE_URL");

// No URL at all is fine: drizzle.config falls back to the docker default, which
// is exactly what this guard wants anyway.
if (url) {
	let host;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		console.error("DATABASE_URL is set but is not a valid URL.");
		process.exit(2);
	}

	// Compared by exact hostname. A `includes("localhost")` test would pass
	// `localhost.evil.example`, and this is the check standing between a typo and
	// a reshaped production database.
	const isLocal =
		host === "localhost" || host === "127.0.0.1" || host === "::1";

	if (!isLocal && !allowRemote) {
		console.error(`
✗ Refusing to push to a remote database.

  host: ${host}

  'drizzle-kit push' rewrites a schema in place with no migration record and no
  confirmation. For anything that is not your local Docker database, use:

      pnpm db:generate && pnpm db:migrate

  which is reviewed, recorded in the journal, and verified by db:migration-parity.

  If you genuinely mean to push to ${host}, pass --allow-remote.
`);
		process.exit(1);
	}

	if (!isLocal && allowRemote) {
		// --allow-remote alone is not enough. The flag proves intent to push
		// remotely; typing the host proves intent to push to THIS one, which is the
		// mistake actually worth catching — a stale DATABASE_URL from another
		// project or environment.
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const answer = await rl.question(
			`⚠  About to push a schema to ${host}.\n   Type the host to confirm: `,
		);
		rl.close();
		if (answer.trim() !== host) {
			console.error("Aborted — nothing was changed.");
			process.exit(1);
		}
	}
}

const child = spawn("drizzle-kit", ["push", ...passthrough], {
	stdio: "inherit",
	shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
