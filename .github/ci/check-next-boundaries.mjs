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
export const SERVER_ACTION_BASELINE = new Map([
	["apps/quickdash/admin/app/_lib/booking-actions.ts", 3],
	["apps/quickdash/admin/app/_lib/catalog-actions.ts", 6],
	["apps/quickdash/admin/app/_lib/client-record-actions.ts", 3],
	["apps/quickdash/admin/app/_lib/contract-actions.ts", 4],
	["apps/quickdash/admin/app/_lib/file-actions.ts", 4],
	["apps/quickdash/admin/app/_lib/first-action-checklist-actions.ts", 1],
	["apps/quickdash/admin/app/_lib/fulfillment-actions.ts", 3],
	["apps/quickdash/admin/app/_lib/inventory-actions.ts", 5],
	["apps/quickdash/admin/app/_lib/invoice-actions.ts", 4],
	["apps/quickdash/admin/app/_lib/order-actions.ts", 3],
	["apps/quickdash/admin/app/_lib/payment-actions.ts", 2],
	["apps/quickdash/admin/app/_lib/project-actions.ts", 4],
	["apps/quickdash/admin/app/_lib/quickdash-orientation-actions.ts", 2],
	["apps/quickdash/admin/app/_lib/quote-actions.ts", 4],
	["apps/quickdash/admin/app/_lib/search-actions.ts", 1],
	["apps/quickdash/admin/app/_lib/shipping-actions.ts", 4],
	["apps/quickdash/admin/app/_lib/time-actions.ts", 3],
	["apps/quickdash/admin/app/sign/[token]/sign-actions.ts", 2],
	["apps/quickengine/account/app/_lib/account-actions.ts", 2],
	["apps/quickengine/account/app/_lib/api-key-actions.ts", 2],
	["apps/quickengine/account/app/_lib/billing-actions.ts", 2],
	["apps/quickengine/account/app/_lib/notification-actions.ts", 2],
	["apps/quickengine/account/app/_lib/org-actions.ts", 2],
	["apps/quickengine/account/app/_lib/team-actions.ts", 4],
	["apps/quickengine/account/app/_lib/workspace-actions.ts", 5],
	["apps/quickengine/account/app/onboarding/actions.ts", 2],
]);

/** Legitimate provider/deployment adapters plus temporary routes assigned to later slices. */
export const NEXT_ROUTE_BASELINE = new Map([
	["apps/quickdash/admin/app/agents.txt/route.ts", ["GET"]],
	["apps/quickdash/admin/app/api/health/route.ts", ["GET"]],
	["apps/quickdash/admin/app/api/inngest/route.ts", ["GET", "POST", "PUT"]],
	["apps/quickdash/admin/app/api/pusher/auth/route.ts", ["POST"]],
	["apps/quickdash/admin/app/api/v1/catalog/[id]/route.ts", ["GET"]],
	["apps/quickdash/admin/app/api/v1/catalog/route.ts", ["GET"]],
	["apps/quickdash/admin/app/api/v1/events/route.ts", ["POST"]],
	["apps/quickengine/account/app/api/health/route.ts", ["GET"]],
	[
		"apps/quickengine/auth/app/api/auth/[...all]/route.ts",
		["GET", "OPTIONS", "POST"],
	],
	["apps/quickengine/auth/app/api/health/route.ts", ["GET"]],
	["apps/quickengine/auth/app/signout/route.ts", ["GET"]],
	["apps/quickengine/web/app/api/billing/plans/route.ts", ["GET"]],
	["apps/quickengine/web/app/api/billing/subscription/route.ts", ["GET"]],
	["apps/quickengine/web/app/api/health/route.ts", ["GET"]],
	["apps/quickengine/web/app/api/resend/webhook/route.ts", ["POST"]],
	["apps/quickengine/web/app/api/stripe/checkout/route.ts", ["POST"]],
	["apps/quickengine/web/app/api/stripe/webhook/route.ts", ["POST"]],
]);

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
