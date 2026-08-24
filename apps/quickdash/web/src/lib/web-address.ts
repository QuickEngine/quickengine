/**
 * The address, but only ever a real web page.
 *
 * 🔴 This value is typed by an operator and stored, then used as an iframe
 * `src` and as a link `href`. A `javascript:` address in either one runs in the
 * CONSOLE's origin, not the previewed site's — and the frame's `sandbox` does
 * not help, because such a document inherits the page that embedded it. So a
 * workspace member who can edit settings could otherwise leave something behind
 * that runs against the next admin who opens this screen.
 *
 * ⚠️ A bare host like `example.com` is rejected rather than guessed at. It never
 * worked: with no scheme the browser resolves it against the console, so the
 * frame used to load QuickDash inside itself instead of the customer's site.
 */
export function webAddress(value: string): string {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.href
			: "";
	} catch {
		return "";
	}
}
