/**
 * The product event contract.
 *
 * 🔑 Every event here earns its place by answering a question somebody will
 * actually ask. Events that only produce a number nobody acts on are noise that
 * makes the real signal harder to find, so this list is deliberately short and
 * each entry names its question.
 *
 * ⚠️ **Dimensions only, never content.** `{ moduleId: "invoicing" }` is a
 * dimension. `{ clientName: "Ada" }` is a leak. Nothing here may carry customer
 * names, record contents, form input, credentials, or full URLs — a path or a
 * category, never a value. The question this answers is *did the person get
 * through*, not *what did they type*.
 */

export const PRODUCT_EVENTS = {
	// ── Acquisition and activation ──────────────────────────────────────────
	/**
	 * Landed on signup. The denominator for everything below, and where
	 * attribution is captured — see `ATTRIBUTION_KEYS`.
	 */
	"signup.viewed": "How many people reach signup at all",
	/** Account created. `signup.viewed` → this is the first real drop-off. */
	"signup.completed": "What fraction of visitors become accounts",
	/** Email confirmed. A gap here means the verification mail is the problem. */
	"signup.verified": "Where verification loses people",

	/** Onboarding started, with the path chosen. */
	"onboarding.started": "Which setup path people pick",
	/** Abandoned. The single most valuable failure signal we have. */
	"onboarding.abandoned": "Where setup loses people, by step",
	"onboarding.completed": "What fraction finish setup",

	/** A workspace exists. The line between an account and a user. */
	"workspace.created": "How many accounts become real workspaces",

	/**
	 * 🔴 The most important event in the system: a first genuinely useful
	 * outcome — an invoice sent, an order taken, a booking confirmed. Not a
	 * record created for the sake of it.
	 *
	 * Activation is `signup.completed` → this. If that ratio is bad, nothing
	 * else on this list matters yet.
	 */
	"activation.first_outcome": "What fraction of signups ever get value",

	// ── Retention ───────────────────────────────────────────────────────────
	// 🔴 There is deliberately no `workspace.returned` event. ANY event from a
	// person on a later day already proves they came back, so a dedicated one
	// would fire on every page load to answer a question the data answers
	// already — write amplification for nothing. `getRetention` derives it.

	// ── Adoption ────────────────────────────────────────────────────────────
	/** A module was switched on or off. Tells us what to build and what to cut. */
	"module.configured": "Which of the fifteen modules anybody wants",
	"saved_view.created": "Whether people build their own workflow",
	"saved_view.opened": "Whether they come back to it",

	// ── Where the product fails people ──────────────────────────────────────
	/** Found what they wanted. */
	"command.succeeded": "Whether search and the palette work",
	/**
	 * Searched and got nothing. **A feature backlog written by users** — the
	 * query TERM is deliberately not recorded, only that it failed and where.
	 */
	"command.failed": "What people expect to exist and does not",
	/**
	 * A recoverable error reached somebody. Category only — never the message,
	 * which can quote record content back.
	 */
	"error.recovered": "Where the product breaks for real people",

	// ── Developer path ──────────────────────────────────────────────────────
	"connect.opened": "Whether anybody finds the developer path",
	"credential.created": "Whether they get as far as a key",
	/** A real API call with a real credential — the developer's activation. */
	"sdk.verified": "Whether a developer ever succeeds",
} as const;

export type ProductEventName = keyof typeof PRODUCT_EVENTS;

/**
 * Where a signup came from.
 *
 * 🔑 Without this, a marketing spend is unmeasurable: money goes out, signups
 * come in, and nobody can say which channel produced a customer who stayed.
 * That is the difference between a marketing pipeline and guessing.
 *
 * ⚠️ **Allowlisted keys, and every one is a dimension.** `utm_content` and
 * `utm_term` are deliberately absent — they routinely carry free text and the
 * whole ad copy, which is content. `referrerHost` rather than the full
 * referrer, because a full URL leaks what somebody was reading before they
 * arrived. `stripUnsafe` would drop a key containing "url" anyway; this names
 * the shape rather than relying on that catch.
 */
export const ATTRIBUTION_KEYS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"referrerHost",
] as const;

/**
 * Keep only the attribution dimensions, from whatever a caller passes.
 *
 * Values are truncated rather than rejected: a campaign name is a dimension, a
 * paragraph pasted into one is not, and dropping the whole attribution because
 * one field was abused would lose the signal entirely.
 */
export function attributionFrom(
	source: Record<string, unknown> = {},
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of ATTRIBUTION_KEYS) {
		const value = source[key];
		if (typeof value !== "string") continue;
		const trimmed = value.trim().slice(0, 80);
		if (trimmed) out[key] = trimmed;
	}
	return out;
}

/** Which application emitted it. Retention reads differently per surface. */
export type ProductSurface =
	| "web"
	| "auth"
	| "account"
	| "quickdash"
	| "cli"
	| "sdk";

export type ProductEventInput = {
	name: ProductEventName;
	surface: ProductSurface;
	userId?: string | null;
	organizationId?: string | null;
	workspaceId?: string | null;
	/** Dimensions only. See the warning at the top of this file. */
	properties?: Record<string, string | number | boolean | null>;
};

/**
 * Property keys that must never appear, whatever an author intends.
 *
 * 🔴 A denylist is the weaker construction and it is used here deliberately:
 * `properties` is open by design so a new dimension needs no migration, and the
 * cost of that openness is that somebody will eventually pass the wrong thing.
 * This catches the specific mistakes that are worth catching — anything that
 * reads like a name, an address, a secret or a body — and `stripUnsafe` drops
 * them rather than refusing the event, because losing one dimension is better
 * than losing the funnel.
 */
const FORBIDDEN = [
	"name",
	"email",
	"phone",
	"address",
	"company",
	"title",
	"description",
	"note",
	"content",
	"body",
	"query",
	"search",
	"token",
	"key",
	"secret",
	"password",
	"url",
];

const isForbidden = (key: string): boolean => {
	const lower = key.toLowerCase();
	return FORBIDDEN.some((word) => lower.includes(word));
};

/**
 * Drop any property whose key suggests it carries content rather than a
 * dimension. Returns what survived, plus what it removed so a test can assert on
 * it.
 */
export function stripUnsafe(
	properties: Record<string, string | number | boolean | null> = {},
): {
	safe: Record<string, string | number | boolean | null>;
	dropped: string[];
} {
	const safe: Record<string, string | number | boolean | null> = {};
	const dropped: string[] = [];
	for (const [key, value] of Object.entries(properties)) {
		if (isForbidden(key)) {
			dropped.push(key);
			continue;
		}
		// A long string is prose, not a dimension. Length is a blunt instrument and
		// a correct one: no legitimate dimension is a paragraph.
		if (typeof value === "string" && value.length > 120) {
			dropped.push(key);
			continue;
		}
		safe[key] = value;
	}
	return { safe, dropped };
}
