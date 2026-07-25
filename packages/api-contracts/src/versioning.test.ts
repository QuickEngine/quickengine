import { describe, expect, it } from "vitest";
import {
	API_VERSIONS,
	CURRENT_API_VERSION,
	deprecationHeaders,
	hasAdequateNotice,
	MIN_DEPRECATION_NOTICE_DAYS,
	VERSION_HEADERS,
	VERSIONING_RULES,
} from "./versioning";

const notice = (days: number) => ({
	deprecatedAt: new Date("2026-01-01T00:00:00Z"),
	sunsetAt: new Date(Date.UTC(2026, 0, 1) + days * 86_400_000),
});

describe("API versioning", () => {
	it("serves a version that is actually routable", () => {
		// A current version absent from the served list would 404 every request.
		expect(API_VERSIONS).toContain(CURRENT_API_VERSION);
	});

	it("keeps the version in the path, not a negotiated header", () => {
		// The header reports what served the response; it never selects it. If this
		// ever becomes a request header, the same URL starts meaning different
		// things to different callers.
		expect(VERSION_HEADERS.version).toBe("QuickEngine-Version");
	});
});

describe("deprecation notices", () => {
	it("emits the standard Deprecation and Sunset headers", () => {
		const headers = deprecationHeaders(notice(200));
		expect(headers[VERSION_HEADERS.deprecation]).toBe(
			"Thu, 01 Jan 2026 00:00:00 GMT",
		);
		expect(headers[VERSION_HEADERS.sunset]).toBeDefined();
	});

	it("points at the replacement when there is one", () => {
		const headers = deprecationHeaders({
			...notice(200),
			replacementUrl: "https://api.quickengine.xyz/v2/clients",
		});
		expect(headers[VERSION_HEADERS.link]).toContain("successor-version");
	});

	it("omits the Link header rather than inventing a destination", () => {
		expect(
			deprecationHeaders(notice(200))[VERSION_HEADERS.link],
		).toBeUndefined();
	});

	it("rejects notice shorter than the promised minimum", () => {
		expect(hasAdequateNotice(notice(MIN_DEPRECATION_NOTICE_DAYS))).toBe(true);
		// Integrations that go untouched for a quarter are the normal case, not the
		// exception — a month's warning is not a warning.
		expect(hasAdequateNotice(notice(30))).toBe(false);
	});
});

describe("versioning rules", () => {
	it("classifies each change exactly once", () => {
		const overlap = VERSIONING_RULES.additive.filter((rule) =>
			(VERSIONING_RULES.breaking as readonly string[]).includes(rule),
		);
		// A change that appears in both lists is a rule nobody can apply.
		expect(overlap).toEqual([]);
	});

	it("treats tightening validation as breaking", () => {
		// The one people get wrong: accepting less is a breaking change even though
		// no field was removed.
		expect(
			VERSIONING_RULES.breaking.some((r) =>
				r.includes("tightening validation"),
			),
		).toBe(true);
		expect(
			VERSIONING_RULES.additive.some((r) =>
				r.includes("accepts strictly more"),
			),
		).toBe(true);
	});
});
