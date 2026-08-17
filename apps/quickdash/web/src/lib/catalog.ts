/**
 * What a catalog item is, and the few facts everything reads off one.
 *
 * 🔑 Shared by the list and the detail panel rather than defined in each. They
 * show the same record, and a price that formats one way in a table and another
 * in the panel beside it reads as a bug in the data.
 */

export type CatalogItem = {
	id: string;
	name: string;
	description: string | null;
	type: string;
	status: string;
	sku: string | null;
	pricingModel: string;
	priceCents: number | null;
	currency: string;
	unitLabel: string | null;
	weightGrams: number | null;
	metadata: Record<string, unknown>;
};

export const money = (cents: number | null, currency: string) =>
	cents == null
		? "No price"
		: new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: currency || "USD",
			}).format(cents / 100);

/**
 * The images an item has, read from the same metadata key the storefront reads.
 *
 * 🔑 Deliberately the SAME contract as a customer's own website rather than a
 * QuickDash-private field: what an operator sees here is exactly what a shopper
 * will see, which is the only way this page can be trusted.
 */
export const imagesOf = (metadata: Record<string, unknown>) =>
	Array.isArray(metadata.images)
		? metadata.images.filter((url): url is string => typeof url === "string")
		: [];

/** A struck-through original, when the item is selling below it. */
export const compareAt = (metadata: Record<string, unknown>) =>
	typeof metadata.compareAtPriceCents === "number"
		? metadata.compareAtPriceCents
		: null;

/** Metadata strings, which arrive as `unknown` and are usually absent. */
export const metaText = (metadata: Record<string, unknown>, key: string) =>
	typeof metadata[key] === "string" ? (metadata[key] as string) : "";

export const metaFlag = (metadata: Record<string, unknown>, key: string) =>
	metadata[key] === true;

export const metaTags = (metadata: Record<string, unknown>) =>
	Array.isArray(metadata.tags)
		? metadata.tags.filter((tag): tag is string => typeof tag === "string")
		: [];

/**
 * Currency in, minor units out.
 *
 * One conversion, at the edge, so nothing downstream has to wonder which unit
 * it is holding. An empty box means "no price", which is a real answer for a
 * quoted or free item and is not the same as zero.
 */
export const toCents = (value: string): number | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return Math.round(parsed * 100);
};

/** Minor units back into something editable, without trailing noise. */
export const fromCents = (cents: number | null | undefined): string =>
	cents == null ? "" : (cents / 100).toFixed(2);
