import { listClientRecords } from "@quickengine/mod-client-records";
import {
	listProjects,
	listProjectTasks,
} from "@quickengine/mod-projects-tasks";
import { ProjectsView } from "../_components/projects-view";
import type { ModulePageProps } from "./types";

export default async function ProjectsPage({ workspaceId }: ModulePageProps) {
	const projectRows = await listProjects(workspaceId);
	const projectTasks = await Promise.all(
		projectRows.map((p) => listProjectTasks(workspaceId, p.id)),
	);
	const projectClients = await listClientRecords(workspaceId);
	return (
		<ProjectsView
			workspaceId={workspaceId}
			clients={projectClients.map((c) => ({ id: c.id, name: c.name }))}
			projects={projectRows.map((p, i) => ({
				...p,
				startDate: p.startDate,
				dueDate: p.dueDate,
				tasks: projectTasks[i],
			}))}
		/>
	);
}
