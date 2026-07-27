import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const HTTP_METHODS = new Set([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"PATCH",
	"POST",
	"PUT",
]);

/** Existing compatibility adapters. Counts may decrease; they must never increase. */
export const SERVER_ACTION_BASELINE = new Map();

/** Legitimate provider/deployment adapters plus temporary routes assigned to later slices. */
export const NEXT_ROUTE_BASELINE = new Map();

async function walk(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (
			entry.isDirectory() &&
			(entry.name.startsWith(".") || entry.name === "node_modules")
		) {
			continue;
		}
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(absolute)));
		else files.push(absolute);
	}
	return files;
}

function exportedActionCount(source) {
	return [
		...source.matchAll(/export\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*/g),
		...source.matchAll(/export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*async\b/g),
	].length;
}

function exportedHttpMethods(source) {
	const methods = new Set();
	for (const match of source.matchAll(
		/export\s+(?:async\s+)?function\s+(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\b/g,
	))
		methods.add(match[1]);
	for (const match of source.matchAll(
		/export\s+const\s+(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\s*=/g,
	))
		methods.add(match[1]);
	for (const match of source.matchAll(/export\s+const\s*\{([^}]+)\}\s*=/g)) {
		for (const candidate of match[1].split(",").map((part) => part.trim())) {
			if (HTTP_METHODS.has(candidate)) methods.add(candidate);
		}
	}
	return [...methods].sort();
}

export function compareInventory(actual, baseline, label) {
	const errors = [];
	for (const current of actual.keys()) {
		if (!baseline.has(current)) errors.push(`Unapproved ${label}: ${current}`);
	}
	for (const expected of baseline.keys()) {
		if (!actual.has(expected)) {
			errors.push(
				`Stale ${label} baseline (remove it deliberately): ${expected}`,
			);
		}
	}
	return errors;
}

export async function auditNextBoundaries(root = ROOT) {
	const sourceFiles = (await walk(path.join(root, "apps"))).filter((file) =>
		/\.(?:ts|tsx)$/.test(file),
	);
	const serverActions = new Map();
	const routes = new Map();
	for (const absolute of sourceFiles) {
		const relative = path.relative(root, absolute).split(path.sep).join("/");
		const source = await readFile(absolute, "utf8");
		if (/^\s*["']use server["'];?/m.test(source)) {
			serverActions.set(relative, exportedActionCount(source));
		}
		if (path.basename(absolute) === "route.ts") {
			routes.set(relative, exportedHttpMethods(source));
		}
	}

	const errors = [
		...compareInventory(
			serverActions,
			SERVER_ACTION_BASELINE,
			"server-action file",
		),
		...compareInventory(routes, NEXT_ROUTE_BASELINE, "Next route handler"),
	];
	for (const [file, count] of serverActions) {
		const maximum = SERVER_ACTION_BASELINE.get(file);
		if (maximum !== undefined && count > maximum) {
			errors.push(
				`${file} grew from at most ${maximum} to ${count} exported actions`,
			);
		}
	}
	for (const [file, methods] of routes) {
		const approved = NEXT_ROUTE_BASELINE.get(file);
		if (approved && methods.some((method) => !approved.includes(method))) {
			errors.push(
				`${file} added an unapproved HTTP method: ${methods.join(", ")}`,
			);
		}
	}

	return { errors, routes, serverActions };
}

if (
	process.argv[1] &&
	pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
	const result = await auditNextBoundaries();
	if (result.errors.length) {
		console.error(
			[
				"Next boundary check failed:",
				...result.errors.map((error) => `- ${error}`),
			].join("\n"),
		);
		process.exitCode = 1;
	} else {
		console.log(
			`Next boundary check passed: ${result.serverActions.size} server-action files and ${result.routes.size} route handlers remain at or below baseline.`,
		);
	}
}
