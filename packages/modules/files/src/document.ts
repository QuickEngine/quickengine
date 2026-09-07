import { z } from "zod";

const MB = 1024 ** 2;

/**
 * The largest single file we will accept, of any kind.
 *
 * 🔴 Was 5 GB, against a free plan whose ENTIRE storage allowance is 2 GB: one
 * file could be two and a half times the plan that permitted it.
 *
 * ⚠️ The ABSOLUTE ceiling, identical on every plan including Custom, and no
 * multiplier can lift anything past it. Above two gigabytes an upload is not a
 * file any more, it is a transfer, and it needs a different mechanism than a
 * form post.
 *
 * The per-kind table below is the safety floor and `UPLOAD_MULTIPLIER` raises it
 * with the plan. A 600 MB photograph stays a mistake on every tier; a 1 GB video
 * on a plan with two terabytes of storage is somebody's ordinary Tuesday.
 */
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * MB;

/**
 * What is reasonable for each kind of file.
 *
 * Chosen so ordinary work always fits and a mistake never does. A 24-megapixel
 * photograph is about 8 MB, so images get 10; a twenty-page scanned contract
 * routinely clears 10 MB, so documents get 25 rather than a 4 MB limit that
 * would generate support tickets on the first day.
 */
export const MAX_BYTES_BY_CATEGORY: Record<string, number> = {
	image: 10 * MB,
	pdf: 25 * MB,
	document: 25 * MB,
	spreadsheet: 25 * MB,
	presentation: 50 * MB,
	code: 10 * MB,
	audio: 100 * MB,
	archive: 100 * MB,
	video: 500 * MB,
	other: 50 * MB,
};

/** The ceiling for one category, falling back to the safe general limit. */
export const maxBytesFor = (category: string): number =>
	MAX_BYTES_BY_CATEGORY[category] ?? MAX_BYTES_BY_CATEGORY.other;

/**
 * How much bigger a file each plan may upload.
 *
 * 🔴 Two different limits, and keeping them apart is the point. The table above
 * is a SAFETY floor: it stops a 600 MB photograph, which is a mistake on any
 * plan. This is a CAPACITY multiplier: a business paying for two terabytes has
 * legitimate reasons to upload a longer video than somebody on the free tier
 * evaluating the product, and refusing them with the beginner's limit would be
 * arbitrary.
 *
 * ⚠️ Every result is still clamped to `MAX_FILE_SIZE_BYTES`. A multiplier can
 * raise a ceiling toward the absolute limit; it can never lift it past one.
 */
export const UPLOAD_MULTIPLIER: Record<string, number> = {
	free: 1,
	commerce: 2,
	scale: 4,
	teams: 8,
	enterprise: 8,
	bypass: 8,
	// Retired tiers, still on live rows until the migration runs. They map to
	// what replaced them so nobody's upload limit shrinks underneath them.
	launch: 2,
	grow: 4,
};

/**
 * The ceiling for one category on one plan.
 *
 * Falls back to the free multiplier for an unknown plan, which under-grants
 * rather than over-grants: a bug here should never hand somebody more than they
 * paid for.
 */
export const maxUploadBytes = (category: string, planId: string): number =>
	Math.min(
		MAX_FILE_SIZE_BYTES,
		maxBytesFor(category) * (UPLOAD_MULTIPLIER[planId] ?? 1),
	);

/**
 * How to say it.
 *
 * ⚠️ States the ceiling that ACTUALLY applied, which depends on the plan. An
 * error naming the free tier's 10 MB to somebody on Scale, who really has 40,
 * sends them to compress a file that would have uploaded fine.
 *
 * ⚠️ No mention of upgrading. This fires on a file that is too big for any
 * sensible use, and selling a plan at that moment would be gouging somebody for
 * a mistake. `PLAN_UPGRADE_REQUIRED` exists for the storage ceiling, which is a
 * genuine capacity question; this is not that.
 */
export const tooLargeMessage = (category: string, planId = "free"): string =>
	`That file is larger than the ${Math.round(maxUploadBytes(category, planId) / MB)} MB limit for ${category === "other" ? "this kind of file" : `${category} files`}. Try a smaller or compressed version.`;

export const FILE_CATEGORIES = [
	"document",
	"spreadsheet",
	"presentation",
	"pdf",
	"image",
	"audio",
	"video",
	"archive",
	"code",
	"other",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const DOCUMENT_STATUSES = [
	"active",
	"archived",
	"trashed",
	"deleting",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const FILE_VERSION_STATUSES = [
	"pending",
	"available",
	"failed",
	"quarantined",
] as const;
export type FileVersionStatus = (typeof FILE_VERSION_STATUSES)[number];

function isSafePathSegment(value: string): boolean {
	return (
		!value.includes("/") &&
		!value.includes("\\") &&
		![...value].some((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || code === 127;
		})
	);
}

const safeFileNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(255)
	.refine((name) => name !== "." && name !== "..", "Invalid file name")
	.refine(isSafePathSegment, "Invalid file name");

const contentTypeSchema = z
	.string()
	.trim()
	.toLowerCase()
	.max(255)
	.regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/);

export const fileVersionInputSchema = z
	.object({
		originalName: safeFileNameSchema,
		contentType: contentTypeSchema,
		sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
		checksumSha256: z
			.string()
			.trim()
			.toLowerCase()
			.regex(/^[a-f0-9]{64}$/),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	/**
	 * 🔴 The per-kind ceiling, checked here because EVERY upload builds one of
	 * these. On the schema rather than in a route, so a new upload path cannot
	 * forget it, which is exactly how product images ended up with no limit.
	 */
	.superRefine((value, ctx) => {
		const category = classifyFileContentType(value.contentType);
		if (value.sizeBytes > maxBytesFor(category)) {
			ctx.addIssue({
				code: "custom",
				path: ["sizeBytes"],
				message: tooLargeMessage(category),
			});
		}
	});

export type FileVersionInput = z.input<typeof fileVersionInputSchema>;
export type FileVersion = z.output<typeof fileVersionInputSchema>;

export const documentInputSchema = z.object({
	title: z.string().trim().min(1).max(255),
	description: z.string().trim().max(10_000).nullable().default(null),
	folderId: z.uuid().nullable().default(null),
	tags: z
		.array(z.string().trim().toLowerCase().min(1).max(50))
		.max(20)
		.transform((tags) => [...new Set(tags)])
		.default([]),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export type DocumentInput = z.input<typeof documentInputSchema>;
export type Document = z.output<typeof documentInputSchema>;

const DOCUMENT_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> =
	{
		active: ["archived", "trashed"],
		archived: ["active", "trashed"],
		trashed: ["active", "deleting"],
		deleting: [],
	};

const VERSION_TRANSITIONS: Record<
	FileVersionStatus,
	readonly FileVersionStatus[]
> = {
	pending: ["available", "failed", "quarantined"],
	available: [],
	failed: ["pending"],
	quarantined: ["available", "failed"],
};

export function canTransitionDocument(
	from: DocumentStatus,
	to: DocumentStatus,
): boolean {
	return DOCUMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionFileVersion(
	from: FileVersionStatus,
	to: FileVersionStatus,
): boolean {
	return VERSION_TRANSITIONS[from].includes(to);
}

const SPREADSHEET_TYPES = new Set([
	"text/csv",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const PRESENTATION_TYPES = new Set([
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const DOCUMENT_TYPES = new Set([
	"text/plain",
	"application/msword",
	"application/rtf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ARCHIVE_TYPES = new Set([
	"application/gzip",
	"application/x-7z-compressed",
	"application/x-rar-compressed",
	"application/zip",
]);
const CODE_TYPES = new Set([
	"application/javascript",
	"application/json",
	"application/xml",
	"text/css",
	"text/html",
	"text/javascript",
	"text/xml",
]);

export function classifyFileContentType(contentType: string): FileCategory {
	const normalized = contentType.trim().toLowerCase();
	if (normalized === "application/pdf") return "pdf";
	if (SPREADSHEET_TYPES.has(normalized)) return "spreadsheet";
	if (PRESENTATION_TYPES.has(normalized)) return "presentation";
	if (DOCUMENT_TYPES.has(normalized)) return "document";
	if (ARCHIVE_TYPES.has(normalized)) return "archive";
	if (CODE_TYPES.has(normalized)) return "code";
	if (normalized.startsWith("image/")) return "image";
	if (normalized.startsWith("audio/")) return "audio";
	if (normalized.startsWith("video/")) return "video";
	return "other";
}
