import { z } from "zod";

export const filesSettingsSchema = z.object({
	// Pinning is the safe default: replacing a document cannot silently rewrite
	// the file that was attached to an invoice, contract, or historical record.
	defaultAttachmentMode: z.enum(["pinned", "latest"]).default("pinned"),
});

export type FilesSettings = z.infer<typeof filesSettingsSchema>;

export const filesModule = {
	id: "files",
	name: "Files & Documents",
	description:
		"Store versioned business files, organize them, and attach an exact version or the latest version to records across a workspace.",
	kind: "shared",
	dependsOn: [] as const,
	// File CRUD is free. Only the account's current stored-byte total is metered.
	meteredAction: "storageBytes",
	settingsSchema: filesSettingsSchema,
	defaultSettings: filesSettingsSchema.parse({}),
	firstActions: [
		{
			id: "files:upload",
			version: 1,
			label: "Upload your first file",
			description: "Add a document or asset to this workspace.",
			moduleId: "files",
			intent: "upload",
			priority: 15,
		},
	] as const,
} as const;
