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

/**
 * A business's own words, over the built-in ones.
 *
 * 🔴 Words only. Line items, totals and tracking numbers stay generated —
 * they are facts about an order, not copy, and a business able to edit them
 * could send a receipt that disagrees with what was charged.
 */
export type TemplateCopy = {
	subject?: string | null;
	/**
	 * The WHOLE email, as HTML the business wrote.
	 *
	 * 🔴 Not a body fragment — the entire document, shell included. A business
	 * that wants a different layout, different colours or no logo at all should
	 * not have to ask us for it, and every "safe subset" we could invent would
	 * be a thing somebody eventually needs to work around.
	 *
	 * ⚠️ DATA is still ours. `{{details}}` is the generated block — line items,
	 * totals, tracking — and the other `{{tokens}}` are values the system knows.
	 * A business able to hand-write a total could send a receipt that disagrees
	 * with what was charged, so those are substituted, never authored.
	 *
	 * Null means the built-in template, which is where every workspace starts.
	 */
	html?: string | null;
};

/**
 * Strip what must never reach a mail client or our own preview.
 *
 * ⚠️ Not a general-purpose sanitiser. Mail clients already refuse scripts, but
 * this HTML is rendered back into the QuickDash console in a preview — so a
 * `<script>` here is self-XSS even where no mail client would run it.
 */
export function sanitiseEmailHtml(html: string): string {
	return html
		.replace(/<\s*(script|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
		.replace(/<\s*(script|iframe|object|embed)\b[^>]*\/?>/gi, "")
		.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
		.replace(/javascript:/gi, "");
}

/**
 * Substitute the values the SYSTEM owns into a business's own HTML.
 *
 * `{{details}}` becomes the generated block. `{{token}}` becomes a value the
 * template knows. An unknown token is left visible rather than blanked —
 * somebody who typed `{{ordernumber}}` should see their mistake in the preview
 * instead of an empty gap they have to guess the cause of.
 */
export function renderAuthored(
	html: string,
	details: string,
	tokens: Record<string, string>,
): string {
	return sanitiseEmailHtml(html)
		.replace(/\{\{\s*details\s*\}\}/gi, details)
		.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) =>
			token in tokens ? tokens[token] : whole,
		);
}

/** Apply an override to a single line of text, substituting `{{token}}`. */
export function applyCopy(
	fallback: string,
	override: string | null | undefined,
	tokens: Record<string, string>,
): string {
	const text = override?.trim();
	if (!text) return fallback;
	return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) =>
		token in tokens ? tokens[token] : whole,
	);
}
