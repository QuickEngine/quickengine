import { describe, expect, it } from "vitest";
import { sanitiseEmailHtml } from "./brand";

/**
 * 🔴 Every case here is a real bypass of the version this replaced.
 *
 * That version stripped the literal string `javascript:` and removed dangerous
 * tags in a single pass. CodeQL flagged four high-severity findings on it, and
 * each one below is the payload behind one of them. A sanitiser is only worth
 * the cases it has actually been shown, so these are the cases.
 *
 * ⚠️ The console preview also renders into an iframe with `sandbox=""`, and
 * mail clients refuse scripts on their own. None of that makes this optional:
 * somebody with template access must not be able to reach an admin of the same
 * workspace, and defence that depends on one layer is not defence.
 */
describe("sanitiseEmailHtml", () => {
	it("removes a tag whose name is assembled by the removal itself", () => {
		// One pass deletes the inner `<script>` and leaves a whole new one behind.
		const out = sanitiseEmailHtml("<scr<script>ipt>alert(1)</script>");
		expect(out.toLowerCase()).not.toContain("script");
	});

	it("strips a plain javascript: link", () => {
		const out = sanitiseEmailHtml('<a href="javascript:alert(1)">x</a>');
		expect(out.toLowerCase()).not.toContain("javascript:");
	});

	it("strips javascript: hidden by a control character", () => {
		const out = sanitiseEmailHtml('<a href="java\tscript:alert(1)">x</a>');
		expect(out.toLowerCase()).not.toContain("script:");
	});

	it("strips javascript: hidden by an HTML entity", () => {
		const out = sanitiseEmailHtml('<a href="java&#115;cript:alert(1)">x</a>');
		expect(out).not.toContain("&#115;");
	});

	it("strips javascript: that the strip would otherwise assemble", () => {
		// Removing the middle occurrence joins the two halves into a live one.
		const out = sanitiseEmailHtml(
			'<a href="javajavascript:script:alert(1)">x</a>',
		);
		expect(out.toLowerCase()).not.toContain("javascript:");
	});

	it("strips a data: URL carrying a document", () => {
		const out = sanitiseEmailHtml(
			'<a href="data:text/html,<script>alert(1)</script>">x</a>',
		);
		expect(out.toLowerCase()).not.toContain("data:");
	});

	it("removes an inline event handler", () => {
		const out = sanitiseEmailHtml("<img src=x onerror=alert(1)>");
		expect(out.toLowerCase()).not.toContain("onerror");
	});

	/**
	 * The half that matters as much as the stripping. A sanitiser that mangles
	 * ordinary links is one a business works around by not using the feature.
	 */
	it("leaves legitimate links exactly as written", () => {
		const html =
			'<a href="https://caffeinate.ca">Shop</a>' +
			'<a href="mailto:hello@caffeinate.ca">Mail</a>' +
			'<a href="tel:+15555550100">Call</a>' +
			'<a href="#top">Top</a>' +
			'<a href="/orders/1">Order</a>';
		expect(sanitiseEmailHtml(html)).toBe(html);
	});

	it("leaves ordinary markup and styling alone", () => {
		const html =
			"<html><head><style>.a{color:red}</style></head>" +
			'<body><table><tr><td style="padding:8px">Hi</td></tr></table></body></html>';
		expect(sanitiseEmailHtml(html)).toBe(html);
	});
});
