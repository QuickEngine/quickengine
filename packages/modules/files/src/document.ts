import { z } from "zod";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 ** 3;

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

export const fileVersionInputSchema = z.object({
	originalName: safeFileNameSchema,
	contentType: contentTypeSchema,
	sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
	checksumSha256: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-f0-9]{64}$/),
	metadata: z.record(z.string(), z.unknown()).default({}),
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
