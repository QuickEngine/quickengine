"use client";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { useActionState } from "react";
import {
	createProjectAction,
	createTaskAction,
	type ProjectActionState,
	projectStatusAction,
	taskStatusAction,
} from "../_lib/project-actions";

const I: ProjectActionState = { error: null, completionId: null };
type Action = (
	state: ProjectActionState,
	data: FormData,
) => Promise<ProjectActionState>;
type Task = { id: string; title: string; priority: string; status: string };
type Project = {
	id: string;
	name: string;
	clientName: string | null;
	status: string;
	dueDate: string | null;
	tasks: Task[];
};
function F({
	action,
	children,
	hidden,
}: {
	action: Action;
	children: React.ReactNode;
	hidden: Record<string, string>;
}) {
	const [s, a] = useActionState(action, I);
	return (
		<form action={a} className="flex flex-wrap gap-2">
			{Object.entries(hidden).map(([k, v]) => (
				<input key={k} type="hidden" name={k} value={v} />
			))}
			{children}
			{s.error && <span className="text-destructive text-xs">{s.error}</span>}
		</form>
	);
}
export function ProjectsView({
	workspaceId,
	clients,
	projects,
}: {
	workspaceId: string;
	clients: Array<{ id: string; name: string }>;
	projects: Project[];
}) {
	return (
		<section className="mt-8 space-y-6">
			<div>
				<h2 className="font-medium text-lg">Projects</h2>
				<p className="text-muted-foreground text-sm">
					Organize client or internal work and its actionable tasks.
				</p>
			</div>
			<F action={createProjectAction} hidden={{ workspaceId }}>
				<Input name="name" placeholder="Project name" required />
				<NativeSelect name="clientId">
					<option value="">Internal project</option>
					{clients.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</NativeSelect>
				<Input name="startDate" type="date" />
				<Input name="dueDate" type="date" />
				<Textarea name="description" placeholder="Description" />
				<Button type="submit">Create project</Button>
			</F>
			{projects.length === 0 ? (
				<p className="rounded-xl border border-dashed p-8 text-muted-foreground">
					No projects yet.
				</p>
			) : (
				projects.map((p) => (
					<article key={p.id} className="space-y-4 rounded-xl border p-4">
						<div className="flex justify-between">
							<div>
								<h3 className="font-medium">{p.name}</h3>
								<p className="text-muted-foreground text-sm">
									{p.clientName ?? "Internal"} · {p.status}
									{p.dueDate ? ` · due ${p.dueDate}` : ""}
								</p>
							</div>
							<F
								action={projectStatusAction}
								hidden={{ workspaceId, id: p.id }}
							>
								<NativeSelect name="target">
									<option value="active">Active</option>
									<option value="on_hold">On hold</option>
									<option value="completed">Completed</option>
									<option value="cancelled">Cancelled</option>
									<option value="draft">Draft</option>
								</NativeSelect>
								<Button type="submit">Change status</Button>
							</F>
						</div>
						<F
							action={createTaskAction}
							hidden={{ workspaceId, projectId: p.id }}
						>
							<Input name="title" placeholder="Task or deliverable" required />
							<NativeSelect name="kind">
								<option value="task">Task</option>
								<option value="deliverable">Deliverable</option>
							</NativeSelect>
							<NativeSelect name="priority">
								<option value="normal">Normal</option>
								<option value="low">Low</option>
								<option value="high">High</option>
								<option value="urgent">Urgent</option>
							</NativeSelect>
							<Input name="dueDate" type="date" />
							<Button type="submit">Add task</Button>
						</F>
						<div className="space-y-2">
							{p.tasks.map((t) => (
								<div
									key={t.id}
									className="flex items-center justify-between rounded-lg bg-foreground/[.04] p-3"
								>
									<span>
										{t.title} · {t.priority} · {t.status}
									</span>
									<F
										action={taskStatusAction}
										hidden={{ workspaceId, id: t.id }}
									>
										<NativeSelect name="target">
											<option value="in_progress">In progress</option>
											<option value="blocked">Blocked</option>
											<option value="completed">Completed</option>
											<option value="todo">To do</option>
											<option value="cancelled">Cancelled</option>
										</NativeSelect>
										<Button type="submit" size="sm">
											Update
										</Button>
									</F>
								</div>
							))}
						</div>
					</article>
				))
			)}
		</section>
	);
}
