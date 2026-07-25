/**
 * API versioning and deprecation.
 *
 * The version lives in the **path** (`/v1/...`), not a header, so a URL in a log,
 * a curl in a support ticket, or a bookmarked docs link is unambiguous about what
 * it called. Header-negotiated versions make the same URL mean different things to
 * different callers, which is unpleasant to debug and impossible to cache.
 *
 * A version is a promise about *breaking* changes only. Additive changes — a new
 * endpoint, a new optional field, a new enum value in a field that already accepts
 * unknown values — ship inside the current version and are not versioned events.
 * Callers must therefore tolerate unknown fields; that expectation is part of the
 * contract, not an implementation detail.
 */

/** Versions the API can serve. Add here before routing a new one. */
export const API_VERSIONS = ["v1"] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];

/** The version new integrations should target. */
export const CURRENT_API_VERSION: ApiVersion = "v1";

export const VERSION_HEADERS = {
	/** The version that actually served the response. */
	version: "QuickEngine-Version",
	/**
	 * Present when the endpoint is deprecated. RFC 9745: an IMF-fixdate of when
	 * deprecation was announced.
	 */
	deprecation: "Deprecation",
	/** RFC 8594: when the endpoint stops responding. Always paired with Deprecation. */
	sunset: "Sunset",
	/** Where to read about the replacement. */
	link: "Link",
} as const;

/**
 * What a caller is told about an endpoint scheduled for removal.
 *
 * `sunsetAt` is a commitment, not a hint: it is the date the endpoint begins
 * refusing requests. Announce it far enough ahead that an integration built by one
 * person on a laptop has time to react.
 */
export type DeprecationNotice = {
	/** When the deprecation was announced. */
	deprecatedAt: Date;
	/** When the endpoint stops responding. */
	sunsetAt: Date;
	/** Absolute URL documenting what to use instead. */
	replacementUrl?: string;
};

/**
 * The minimum notice between announcing a deprecation and enforcing it.
 *
 * Six months is deliberate. A shorter window is only workable when you can see
 * and contact every integrator; QuickEngine's callers include scripts and side
 * projects that may not be touched for a quarter at a time.
 */
export const MIN_DEPRECATION_NOTICE_DAYS = 180;

/** Headers announcing a deprecation, ready to merge into a response. */
export function deprecationHeaders(
	notice: DeprecationNotice,
): Record<string, string> {
	const headers: Record<string, string> = {
		[VERSION_HEADERS.deprecation]: notice.deprecatedAt.toUTCString(),
		[VERSION_HEADERS.sunset]: notice.sunsetAt.toUTCString(),
	};
	if (notice.replacementUrl) {
		headers[VERSION_HEADERS.link] =
			`<${notice.replacementUrl}>; rel="deprecation successor-version"`;
	}
	return headers;
}

/** Whether a notice satisfies the minimum-notice rule. Enforced by tests, not at runtime. */
export function hasAdequateNotice(notice: DeprecationNotice): boolean {
	const days =
		(notice.sunsetAt.getTime() - notice.deprecatedAt.getTime()) / 86_400_000;
	return days >= MIN_DEPRECATION_NOTICE_DAYS;
}

/**
 * Changes that may ship inside an existing version, and those that may not.
 *
 * Written down because the judgement is made per pull request, usually quickly,
 * and "is this breaking?" is exactly the question people answer optimistically
 * when they are close to the change.
 */
export const VERSIONING_RULES = {
	/** Ship freely in the current version. */
	additive: [
		"a new endpoint",
		"a new optional request field",
		"a new response field",
		"a new enum value in a field documented as open-ended",
		"a new error code that only replaces INTERNAL_ERROR",
		"a relaxed validation rule that accepts strictly more input",
	],
	/** Requires a new version. */
	breaking: [
		"removing or renaming any response field",
		"removing an endpoint, or changing its path or method",
		"making an optional request field required",
		"tightening validation so previously accepted input is refused",
		"changing a field's type or its units",
		"changing the HTTP status for an existing outcome",
		"changing the meaning of an existing error code",
	],
} as const;
