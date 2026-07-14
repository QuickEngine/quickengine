import { z } from "zod";
import { TASK_PRIORITIES } from "./task";

export const projectsTasksSettingsSchema = z.object({
	allowInternalProjects: z.boolean().default(true),
	allowSubtasks: z.boolean().default(true),
	defaultTaskPriority: z.enum(TASK_PRIORITIES).default("normal"),
});

export type ProjectsTasksSettings = z.infer<typeof projectsTasksSettingsSchema>;

export const projectsTasksModule = {
	id: "projects-tasks",
	name: "Projects & Tasks",
	description:
		"Organize client or internal work into projects, milestones, tasks, and deliverables.",
	kind: "domain",
	dependsOn: ["client-records"] as const,
	// Organizing work is a customer outcome, not infrastructure usage.
	meteredAction: null,
	settingsSchema: projectsTasksSettingsSchema,
	defaultSettings: projectsTasksSettingsSchema.parse({}),
} as const;
