// Pure slug helpers — no DB, unit-tested. A workspace's slug is derived from its
// display name (which is NOT unique — two businesses can share a name) and made
// unique per account by appending a number on collision.

/**
 * Strip one repeated character from both ends.
 *
 * 🔴 A loop rather than `/^-+|-+$/`. That regex is a polynomial ReDoS: the `-+$`
 * alternative has no anchor to fail fast on, so the engine retries it from every
 * position and a name of many hyphens costs quadratic time. This is linear and
 * does the same job. Every slug and origin helper in the codebase uses it for
 * exactly that reason.
 */
export function trimRepeated(value: string, character: string): string {
	let start = 0;
	let end = value.length;
	while (start < end && value[start] === character) start += 1;
	while (end > start && value[end - 1] === character) end -= 1;
	return value.slice(start, end);
}

// URL-safe slug from a display name: lowercase, non-alphanumerics collapsed to
// single hyphens, trimmed. Falls back to "workspace" for empty/symbol-only names.
export function slugify(name: string): string {
	const slug = trimRepeated(
		name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		"-",
	);
	return slug || "workspace";
}

// First free slug given the ones already taken: base, base-2, base-3, …
export function nextAvailableSlug(
	base: string,
	taken: Iterable<string>,
): string {
	const used = new Set(taken);
	if (!used.has(base)) {
		return base;
	}
	let n = 2;
	while (used.has(`${base}-${n}`)) {
		n += 1;
	}
	return `${base}-${n}`;
}
