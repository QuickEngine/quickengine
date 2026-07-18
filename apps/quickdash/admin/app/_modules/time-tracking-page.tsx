import {
	listProjects,
	listProjectTasks,
} from "@quickengine/mod-projects-tasks";
import {
	listTimeEntries,
	timeTrackingSettingsSchema,
} from "@quickengine/mod-time-tracking";
import { TimeTrackingView } from "../_components/time-tracking-view";
import type { ModulePageProps } from "./types";

export default async function TimeTrackingPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const timeSettings = timeTrackingSettingsSchema.parse(settings);
	const timeRows = await listTimeEntries(workspaceId);
	const timeProjects = await listProjects(workspaceId);
	const timeTasks = await Promise.all(
		timeProjects.map((project) => listProjectTasks(workspaceId, project.id)),
	);
	return (
		<TimeTrackingView
			workspaceId={workspaceId}
			defaultBillable={timeSettings.defaultBillable}
			defaultRateCents={timeSettings.defaultHourlyRateCents}
			projects={timeProjects
				.filter(
					(project) => !["completed", "cancelled"].includes(project.status),
				)
				.map((project, index) => ({
					id: project.id,
					name: project.name,
					tasks: (timeTasks[index] ?? [])
						.filter((task) => !["completed", "cancelled"].includes(task.status))
						.map((task) => ({ id: task.id, title: task.title })),
				}))}
			entries={timeRows.map((entry) => ({
				id: entry.id,
				projectName: entry.projectName,
				taskTitle: entry.taskTitle,
				description: entry.description,
				status: entry.status,
				durationSeconds: entry.durationSeconds,
				workDate: entry.workDate,
				billable: entry.billable,
				startedAt: entry.startedAt?.toISOString() ?? null,
			}))}
		/>
	);
}
