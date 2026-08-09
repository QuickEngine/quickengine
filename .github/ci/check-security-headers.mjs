import { readFile } from "node:fs/promises";

const configs = [
	"apps/quickengine/web/vercel.json",
	"apps/quickdash/auth/vercel.json",
	"apps/quickdash/account/vercel.json",
	"apps/quickdash/web/vercel.json",
	"apps/quickdash/portal/vercel.json",
];

const requiredHeaders = new Set([
	"content-security-policy",
	"strict-transport-security",
	"x-content-type-options",
	"x-frame-options",
	"referrer-policy",
	"permissions-policy",
	"cross-origin-opener-policy",
	"cross-origin-resource-policy",
]);

const requiredCspDirectives = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"upgrade-insecure-requests",
];

const failures = [];
for (const path of configs) {
	const config = JSON.parse(await readFile(path, "utf8"));
	const catchAll = config.headers?.find((entry) => entry.source === "/(.*)");
	const headers = new Map(
		(catchAll?.headers ?? []).map(({ key, value }) => [
			key.toLowerCase(),
			value,
		]),
	);
	for (const key of requiredHeaders) {
		if (!headers.has(key)) failures.push(`${path}: missing ${key}`);
	}
	const csp = headers.get("content-security-policy") ?? "";
	for (const directive of requiredCspDirectives) {
		if (!csp.includes(directive)) {
			failures.push(`${path}: CSP missing ${directive}`);
		}
	}
	if (headers.get("x-frame-options") !== "DENY") {
		failures.push(`${path}: X-Frame-Options must be DENY`);
	}
}

if (failures.length) {
	console.error(`Security-header check failed:\n${failures.join("\n")}`);
	process.exit(1);
}

console.log(
	`Security-header check passed: ${configs.length} deployed Vite surfaces.`,
);
