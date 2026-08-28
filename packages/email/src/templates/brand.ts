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
 * Schemes a link in an email may use. **An allowlist, deliberately.**
 *
 * 🔴 The previous version stripped the literal string `javascript:`, and that is
 * exactly the trap this rule exists to catch. `java&#115;cript:` decodes to it
 * only AFTER the strip has run; a tab inside the word survives it outright; and
 * `javajavascript:script:` BECOMES it, because removing the middle joins the two
 * halves. A blocklist has to be right about every disguise. An allowlist only
 * has to be right about the five schemes an email actually needs.
 */
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "cid"]);

const PAIRED_ELEMENTS =
	/<\s*(script|iframe|object|embed|link|base)\b[\s\S]*?<\/\s*\1\s*>/gi;
const LONE_ELEMENTS =
	/<\s*\/?\s*(script|iframe|object|embed|link|base)\b[^>]*>/gi;
const EVENT_HANDLERS = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Attributes whose value is fetched or navigated to. */
const URL_ATTRIBUTES =
	/\s(href|src|action|formaction|background|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * The scheme of a URL, seen past the encodings that hide one.
 *
 * Returns null for a relative URL or an anchor, which carry no scheme and are
 * safe. Entities and control characters are decoded FIRST, because a browser
 * decodes them before it resolves the URL — a check that skips that step is
 * inspecting a different string from the one that will actually be used.
 */
function schemeOf(rawValue: string): string | null {
	const unquoted = rawValue.trim().replace(/^["']|["']$/g, "");
	const decoded = unquoted
		.replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);?/g, (_m, dec: string) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		)
		// Browsers ignore these inside a scheme, which is how a tab in the middle
		// of the word gets a link past a literal comparison.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
		.replace(/[\u0000-\u0020]/g, "");
	const match = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
	return match ? match[1].toLowerCase() : null;
}

/**
 * Strip what must never reach a mail client or our own preview.
 *
 * ⚠️ Not a general-purpose sanitiser, and not the only defence. The console
 * preview renders into an iframe with `sandbox=""`, so nothing can execute there
 * whatever survives this, and mail clients refuse scripts on their own. This is
 * the third layer, and it exists so that somebody with template access cannot
 * reach an admin of the same workspace.
 *
 * 🔴 Every pass runs to a FIXPOINT. One pass over a tag whose name is split by
 * another tag removes the inner one and leaves a whole new tag behind — the
 * removal itself assembles the thing being removed. Repeating until nothing
 * changes is the only way a replacement-based strip is sound.
 */
export function sanitiseEmailHtml(html: string): string {
	let out = html;

	// ⚠️ `while (s !== (s = s.replace(…)))` looks like a typo and is not. It is
	// the recognised way to write "keep replacing until nothing changes": the
	// assignment happens inside the comparison, so the loop ends only when a pass
	// changed nothing. A plain `.replace()` runs once and leaves whatever its own
	// removal assembled.

	// Paired dangerous elements, contents included.
	// biome-ignore lint/suspicious/noAssignInExpressions: the assignment IS the loop
	while (out !== (out = out.replace(PAIRED_ELEMENTS, ""))) {
		// Intentionally empty: the work happens in the condition.
	}
	// …and unpaired, self-closing, or a stray closing tag.
	// biome-ignore lint/suspicious/noAssignInExpressions: the assignment IS the loop
	while (out !== (out = out.replace(LONE_ELEMENTS, ""))) {
		// Intentionally empty: the work happens in the condition.
	}
	// Inline handlers: onclick, onerror, onload, anything on*.
	// biome-ignore lint/suspicious/noAssignInExpressions: the assignment IS the loop
	while (out !== (out = out.replace(EVENT_HANDLERS, ""))) {
		// Intentionally empty: the work happens in the condition.
	}

	// A URL attribute keeps its value only when the scheme is one we allow. This
	// pass can only ever shorten a value to `#`, so it cannot assemble a new tag
	// and does not need a fixpoint of its own.
	return out.replace(
		URL_ATTRIBUTES,
		(whole, attribute: string, value: string) => {
			const scheme = schemeOf(value);
			if (scheme === null || SAFE_SCHEMES.has(scheme)) return whole;
			return ` ${attribute}="#"`;
		},
	);
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
	const clean = sanitiseEmailHtml(html);
	const hasDetails = /\{\{\s*details\s*\}\}/i.test(clean);

	/**
	 * 🔴 The generated block is APPENDED when the author left no place for it.
	 *
	 * It used to be dropped. A business pasting a designed template that did not
	 * happen to include `{{details}}` sent every customer an email with no order
	 * on it — and because most sample templates carry example products and
	 * totals, what the customer actually received was somebody else's fictional
	 * order. Confirmed on 2026-08-28: a real order for one bag at $29.00 arrived
	 * showing three different products and a $72.50 total.
	 *
	 * ⚠️ Appending can look untidy against a carefully designed email. That is a
	 * far smaller problem than a customer being told they bought something they
	 * did not, and it is visible the first time it happens rather than silent.
	 */
	const body = hasDetails
		? clean.replace(/\{\{\s*details\s*\}\}/gi, details)
		: appendDetails(clean, details);

	return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) =>
		token in tokens ? tokens[token] : whole,
	);
}

/**
 * Put the generated block at the end of the author's document.
 *
 * ⚠️ Inside `</body>` where there is one, so it lands within the styled shell
 * rather than after the closing tag where clients may drop it.
 */
function appendDetails(html: string, details: string): string {
	const block = `\n<div class="qe-order-details">\n${details}\n</div>\n`;
	const closing = /<\/body\s*>/i;
	return closing.test(html)
		? html.replace(closing, `${block}</body>`)
		: `${html}${block}`;
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
