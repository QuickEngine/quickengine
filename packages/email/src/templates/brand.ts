/**
 * The workspace's identity, as it appears in mail sent to ITS customers.
 *
 * 🔴 These emails are not from QuickEngine. A receipt for a Gemsutopia order is
 * from Gemsutopia — the shopper has no relationship with us and should never
 * learn of one from a transactional email. Everything visible is supplied by
 * the workspace; the platform supplies only the layout.
 *
 * Consequences worth stating, because they are easy to undo by accident:
 * no QuickEngine logo, no "powered by", no link to quickengine.xyz.
 */
export type EmailBrand = {
	/** The business name. Shown in the header and the footer. */
	name: string;
	/** Where replies and support requests go. Never a QuickEngine address. */
	supportEmail: string;
	/** Absolute URL to a logo. Falls back to the name set in type. */
	logoUrl?: string;
	/** Optional line under the name — a tagline, a licence number, anything. */
	tagline?: string;
	/**
	 * Accent for buttons and rules.
	 *
	 * ⚠️ Must be a solid hex. Mail clients discard `oklch()`, custom properties
	 * and most modern colour syntax, so the theme tokens the apps use cannot
	 * cross into email.
	 */
	accentColor?: string;
	/** The business's own site, linked from the footer. */
	websiteUrl?: string;
};

export const DEFAULT_ACCENT = "#111111";

/**
 * Escape text destined for HTML.
 *
 * Every value here originates from a workspace or a customer — a product name,
 * a person's name, an address. Interpolating those raw into a template is a
 * stored-XSS hole that happens to render in an inbox.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Money, formatted for the recipient rather than for us.
 *
 * ⚠️ Amounts cross the boundary in MINOR UNITS — cents, pence — because that is
 * how they are stored, and a float would round somebody's total. The conversion
 * happens here, once.
 */
export function formatMoney(minorUnits: number, currency: string): string {
	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(minorUnits / 100);
}

export function formatDate(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value;
	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "long",
		timeStyle: "short",
	}).format(date);
}
