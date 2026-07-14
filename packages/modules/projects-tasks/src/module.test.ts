import { describe, expect, it } from "vitest";
import { canTransitionMilestone, milestoneInputSchema } from "./milestone";
import { projectsTasksModule, projectsTasksSettingsSchema } from "./module";
import {
	calendarDateSchema,
	canTransitionProject,
	projectInputSchema,
} from "./project";
import { canTransitionTask, taskInputSchema } from "./task";

const clientId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const milestoneId = "00000000-0000-4000-8000-000000000003";
const parentTaskId = "00000000-0000-4000-8000-000000000004";

describe("projects and tasks module", () => {
	it("depends on client records but does not meter business work", () => {
		expect(projectsTasksModule).toMatchObject({
			id: "projects-tasks",
			dependsOn: ["client-records"],
			meteredAction: null,
		});
	});

	it("supports internal projects, subtasks, and a neutral default priority", () => {
		expect(projectsTasksSettingsSchema.parse({})).toEqual({
			allowInternalProjects: true,
			allowSubtasks: true,
			defaultTaskPriority: "normal",
		});
	});
});

describe("project contract", () => {
	it("normalizes both client work and internal work", () => {
		expect(
			projectInputSchema.parse({
				clientId,
				name: " Website launch ",
				startDate: "2026-08-01",
				dueDate: "2026-08-31",
			}),
		).toMatchObject({
			clientId,
			name: "Website launch",
			status: "draft",
		});
		expect(
			projectInputSchema.parse({ name: "Improve shop workflow" }),
		).toMatchObject({ clientId: null });
	});

	it("uses real date-only deadlines and rejects reversed ranges", () => {
		expect(calendarDateSchema.parse("2028-02-29")).toBe("2028-02-29");
		expect(() => calendarDateSchema.parse("2027-02-29")).toThrow();
		expect(() =>
			projectInputSchema.parse({
				name: "Impossible schedule",
				startDate: "2026-08-31",
				dueDate: "2026-08-01",
			}),
		).toThrow();
	});

	it("supports pausing, completing, and reopening real work", () => {
		expect(canTransitionProject("draft", "active")).toBe(true);
		expect(canTransitionProject("active", "on_hold")).toBe(true);
		expect(canTransitionProject("on_hold", "completed")).toBe(true);
		expect(canTransitionProject("completed", "active")).toBe(true);
		expect(canTransitionProject("draft", "completed")).toBe(false);
	});
});

describe("milestone contract", () => {
	it("groups project work into ordered, reopenable checkpoints", () => {
		expect(
			milestoneInputSchema.parse({
				projectId,
				name: " Design approved ",
				dueDate: "2026-08-15",
				position: 2,
			}),
		).toMatchObject({
			projectId,
			name: "Design approved",
			status: "open",
			position: 2,
		});
		expect(canTransitionMilestone("open", "completed")).toBe(true);
		expect(canTransitionMilestone("completed", "open")).toBe(true);
		expect(canTransitionMilestone("completed", "cancelled")).toBe(false);
	});
});

describe("task contract", () => {
	it("supports deliverables, milestone grouping, and nested work", () => {
		expect(
			taskInputSchema.parse({
				projectId,
				milestoneId,
				parentTaskId,
				kind: "deliverable",
				title: " Final logo files ",
				priority: "high",
				estimatedMinutes: 240,
				dueDate: "2026-08-20",
			}),
		).toMatchObject({
			projectId,
			milestoneId,
			parentTaskId,
			kind: "deliverable",
			title: "Final logo files",
			status: "todo",
			priority: "high",
		});
	});

	it("rejects invalid estimates, positions, and date ranges", () => {
		expect(() =>
			taskInputSchema.parse({
				projectId,
				title: "Invalid estimate",
				estimatedMinutes: 0,
			}),
		).toThrow();
		expect(() =>
			taskInputSchema.parse({
				projectId,
				title: "Invalid position",
				position: -1,
			}),
		).toThrow();
		expect(() =>
			taskInputSchema.parse({
				projectId,
				title: "Reversed dates",
				startDate: "2026-09-01",
				dueDate: "2026-08-31",
			}),
		).toThrow();
	});

	it("tracks active, blocked, completed, cancelled, and reopened work", () => {
		expect(canTransitionTask("todo", "in_progress")).toBe(true);
		expect(canTransitionTask("in_progress", "blocked")).toBe(true);
		expect(canTransitionTask("blocked", "completed")).toBe(true);
		expect(canTransitionTask("completed", "todo")).toBe(true);
		expect(canTransitionTask("cancelled", "todo")).toBe(true);
		expect(canTransitionTask("completed", "cancelled")).toBe(false);
	});
});
