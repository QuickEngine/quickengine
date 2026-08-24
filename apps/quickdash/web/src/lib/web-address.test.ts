import { describe, expect, it } from "vitest";
import { webAddress } from "./web-address";

/**
 * The preview address is typed by an operator, stored, and then used as an
 * iframe `src` and a link `href`.
 *
 * 🔴 A `javascript:` address in either sink runs in the CONSOLE's origin, not
 * the previewed site's — the frame's `sandbox` does not help, because such a
 * document inherits the page that embedded it. CodeQL found this as
 * `js/xss-through-dom` on 2026-08-24.
 */
describe("the address a preview is allowed to load", () => {
	it("keeps ordinary web addresses", () => {
		expect(webAddress("https://caffeinate.ca")).toBe("https://caffeinate.ca/");
		expect(webAddress("http://localhost:3000")).toBe("http://localhost:3000/");
		expect(webAddress("https://shop.example.com/a?b=1")).toBe(
			"https://shop.example.com/a?b=1",
		);
	});

	it("refuses a script address", () => {
		expect(webAddress("javascript:alert(1)")).toBe("");
		// Case and padding are not a way around it.
		expect(webAddress("JavaScript:alert(1)")).toBe("");
		expect(webAddress("  javascript:alert(document.cookie)  ".trim())).toBe("");
	});

	it("refuses an inline document", () => {
		expect(webAddress("data:text/html,<script>alert(1)</script>")).toBe("");
		expect(webAddress("vbscript:msgbox(1)")).toBe("");
		expect(webAddress("blob:https://example.com/abc")).toBe("");
	});

	it("refuses a local file", () => {
		expect(webAddress("file:///etc/passwd")).toBe("");
	});

	/**
	 * ⚠️ Never worked anyway: with no scheme the browser resolves it against the
	 * console, so the frame loaded QuickDash inside itself.
	 */
	it("refuses a bare host rather than guessing a scheme", () => {
		expect(webAddress("example.com")).toBe("");
		expect(webAddress("//example.com")).toBe("");
	});

	it("refuses nothing at all", () => {
		expect(webAddress("")).toBe("");
	});
});
