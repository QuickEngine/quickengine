import { z } from "zod";

function isSafeFolderName(value: string): boolean {
	return (
		!value.includes("/") &&
		!value.includes("\\") &&
		![...value].some((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || code === 127;
		})
	);
}

export const folderInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.refine(isSafeFolderName, "Invalid folder name"),
	parentId: z.uuid().nullable().default(null),
});

export type FolderInput = z.input<typeof folderInputSchema>;
export type Folder = z.output<typeof folderInputSchema>;
