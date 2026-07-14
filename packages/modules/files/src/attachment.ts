import { z } from "zod";

const canonicalKeySchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const ATTACHMENT_ROLES = [
	"attachment",
	"reference",
	"deliverable",
	"source",
	"other",
] as const;

export const fileAttachmentInputSchema = z.object({
	documentId: z.uuid(),
	// A concrete version pins history. Null deliberately follows the document's
	// latest available version and is appropriate only when that behavior is wanted.
	versionId: z.uuid().nullable().default(null),
	targetModuleId: canonicalKeySchema,
	targetRecordType: canonicalKeySchema,
	// Target ids are opaque: current module records use UUIDs, but generic file
	// attachments must also support modules whose stable ids use another format.
	targetRecordId: z.string().trim().min(1).max(200),
	role: z.enum(ATTACHMENT_ROLES).default("attachment"),
	position: z.number().int().nonnegative().max(2_147_483_647).default(0),
});

export type FileAttachmentInput = z.input<typeof fileAttachmentInputSchema>;
export type FileAttachment = z.output<typeof fileAttachmentInputSchema>;

/** Resolve the stored version pointer according to the workspace's safe default. */
export function resolveAttachmentVersionId(
	defaultMode: "pinned" | "latest",
	currentVersionId: string,
	requestedVersionId: string | null = null,
): string | null {
	if (requestedVersionId) return requestedVersionId;
	return defaultMode === "pinned" ? currentVersionId : null;
}
