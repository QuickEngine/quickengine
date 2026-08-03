import { z } from "zod";

export const contentSettingsSchema = z.object({
	/**
	 * Whether a slot appears on the site the moment it is saved.
	 *
	 * Off by default. A business editing its About page should not discover that
	 * half a sentence went live because they got distracted — publishing is a
	 * deliberate second action. An operator who finds that tedious can turn it on.
	 */
	publishOnSave: z.boolean().default(false),
});

export type ContentSettings = z.infer<typeof contentSettingsSchema>;

export const contentModule = {
	id: "content",
	name: "Content",
	description:
		"Edit the words on your own website — an About section, legal pages, a headline — without touching code.",
	kind: "shared",
	// 🔴 Depends on nothing. Content is text belonging to a workspace; it does not
	// need clients, a catalog, or money to exist. A brochure site with no shop is
	// a legitimate workspace, and making this depend on commerce modules would
	// force one to enable Orders to change a paragraph.
	dependsOn: [] as const,
	// Editing your own copy is not infrastructure consumption. Storage for an
	// uploaded image is metered by the Files module, where it belongs.
	meteredAction: null,
	settingsSchema: contentSettingsSchema,
	defaultSettings: contentSettingsSchema.parse({}),
	firstActions: [
		{
			id: "content:edit",
			version: 1,
			label: "Edit your website's words",
			description:
				"Change the text on your own site — headlines, an About section, legal pages.",
			moduleId: "content",
			intent: "update",
			priority: 40,
			requires: [] as const,
			steps: [
				{
					id: "content:edit:register",
					version: 1,
					label: "Declare your editable slots",
					description:
						"A developer registers which parts of the site can be edited — a heading, an About section, a legal page.",
					intent: "create",
				},
				{
					id: "content:edit:write",
					version: 1,
					label: "Write your copy",
					description: "Fill in the words for each slot.",
					intent: "update",
				},
				{
					id: "content:edit:publish",
					version: 1,
					label: "Publish it",
					description:
						"Nothing reaches the live site until it is published, so a half-written page never appears.",
					intent: "update",
				},
			],
		},
	],
} as const;
