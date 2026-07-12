import { describe, expect, it } from "vitest";
import { nextAvailableSlug, slugify } from "./slug";

describe("slugify", () => {
	it("lowercases and hyphenates words", () => {
		expect(slugify("Acme Inc.")).toBe("acme-inc");
		expect(slugify("  Hello   World  ")).toBe("hello-world");
	});

	it("collapses and trims separators + symbols", () => {
		expect(slugify("--Acme!!--")).toBe("acme");
		expect(slugify("a & b / c")).toBe("a-b-c");
	});

	it("drops unicode/emoji rather than emitting garbage", () => {
		expect(slugify("Café ☕ Shop")).toBe("caf-shop");
	});

	it("falls back to 'workspace' for empty or symbol-only names", () => {
		expect(slugify("")).toBe("workspace");
		expect(slugify("   ")).toBe("workspace");
		expect(slugify("!!!")).toBe("workspace");
	});
});

describe("nextAvailableSlug", () => {
	it("returns the base when it's free", () => {
		expect(nextAvailableSlug("acme", [])).toBe("acme");
		expect(nextAvailableSlug("acme", ["other"])).toBe("acme");
	});

	it("appends the first free number on collision", () => {
		expect(nextAvailableSlug("acme", ["acme"])).toBe("acme-2");
		expect(nextAvailableSlug("acme", ["acme", "acme-2"])).toBe("acme-3");
	});

	it("fills the lowest gap rather than always incrementing", () => {
		expect(nextAvailableSlug("acme", ["acme", "acme-3"])).toBe("acme-2");
	});
});
