// Pure slug helpers — no DB, unit-tested. A workspace's slug is derived from its
// display name (which is NOT unique — two businesses can share a name) and made
// unique per account by appending a number on collision.

// URL-safe slug from a display name: lowercase, non-alphanumerics collapsed to
// single hyphens, trimmed. Falls back to "workspace" for empty/symbol-only names.
export function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
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
