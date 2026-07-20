"use client";
import { Clock, Play, Stop } from "@phosphor-icons/react";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { useActionState, useEffect, useState } from "react";
import {
	addTimeAction,
	reviewTimeAction,
	type TimeActionState,
	timerAction,
} from "../_lib/time-actions";

const INITIAL: TimeActionState = { error: null, completionId: null };
type Action = (
	state: TimeActionState,
	data: FormData,
) => Promise<TimeActionState>;
type Project = {
	id: string;
	name: string;
	tasks: Array<{ id: string; title: string }>;
};
type Entry = {
	id: string;
	projectName: string;
	taskTitle: string | null;
	description: string | null;
	status: string;
	durationSeconds: number;
	workDate: string | null;
	billable: boolean;
	startedAt: string | null;
};
function Form({
	action,
	hidden,
	children,
	idempotent,
}: {
	action: Action;
	hidden: Record<string, string>;
	children: React.ReactNode;
	// Opt-in for the manual-entry form: sends a per-submit key so a double-fire logs one
	// entry. The timer and review forms share this wrapper and don't need it.
	idempotent?: boolean;
}) {
	const [state, formAction] = useActionState(action, INITIAL);
	const [key, setKey] = useState(() => crypto.randomUUID());
	useEffect(() => {
		if (state.completionId) setKey(crypto.randomUUID());
	}, [state.completionId]);
	return (
		<form action={formAction} className="flex flex-wrap items-center gap-2">
			{Object.entries(hidden).map(([name, value]) => (
				<input key={name} type="hidden" name={name} value={value} />
			))}
			{idempotent && <input type="hidden" name="idempotencyKey" value={key} />}
			{children}
			{state.error && (
				<span className="text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}
export function TimeTrackingView({
	workspaceId,
	projects,
	entries,
	defaultBillable,
	defaultRateCents,
}: {
	workspaceId: string;
	projects: Project[];
	entries: Entry[];
	defaultBillable: boolean;
	defaultRateCents: number | null;
}) {
	const running = entries.find((e) => e.status === "running");
	const tasks = projects.flatMap((p) =>
		p.tasks.map((t) => ({ ...t, project: p.name })),
	);
	return (
		<section className="mt-8 space-y-6">
			<div>
				<h2 className="font-medium text-lg">Time ledger</h2>
				<p className="text-muted-foreground text-sm">
					Track actual work. Billable time is not invoiced until explicitly
					reviewed and attached.
				</p>
			</div>
			<div className="rounded-xl border p-4">
				<h3 className="mb-3 font-medium">Live timer</h3>
				{running ? (
					<div className="flex justify-between">
						<span>
							{running.projectName} · started{" "}
							{running.startedAt
								? new Date(running.startedAt).toLocaleString()
								: ""}
						</span>
						<Form action={timerAction} hidden={{ workspaceId, id: running.id }}>
							<Button type="submit" variant="destructive">
								<Stop /> Stop
							</Button>
						</Form>
					</div>
				) : (
					<Form action={timerAction} hidden={{ workspaceId }}>
						<ProjectSelect projects={projects} />
						<TaskSelect tasks={tasks} />
						<Button type="submit">
							<Play /> Start
						</Button>
					</Form>
				)}
			</div>
			<div className="rounded-xl border p-4">
				<h3 className="mb-3 font-medium">Manual entry</h3>
				<Form action={addTimeAction} hidden={{ workspaceId }} idempotent>
					<ProjectSelect projects={projects} />
					<TaskSelect tasks={tasks} />
					<Input name="workDate" type="date" required />
					<Input
						name="minutes"
						type="number"
						min="1"
						placeholder="Minutes"
						required
					/>
					<Input
						name="rate"
						type="number"
						min="0"
						step=".01"
						defaultValue={
							defaultRateCents === null ? "" : defaultRateCents / 100
						}
						placeholder="Hourly rate"
					/>
					<label className="text-sm">
						<input
							name="billable"
							type="checkbox"
							defaultChecked={defaultBillable}
						/>{" "}
						Billable
					</label>
					<Textarea name="description" placeholder="What was done?" />
					<Button type="submit">Add time</Button>
				</Form>
			</div>
			<div className="space-y-2">
				{entries.length === 0 ? (
					<div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
						<Clock className="mx-auto" />
						No time entries yet.
					</div>
				) : (
					entries.map((e) => (
						<article
							key={e.id}
							className="flex justify-between gap-3 rounded-xl border p-4"
						>
							<div>
								<strong>{e.projectName}</strong>{" "}
								<Badge variant="secondary">{e.status}</Badge>
								{e.billable && <Badge variant="outline">Billable</Badge>}
								<p className="text-muted-foreground text-sm">
									{e.taskTitle ?? "No task"} ·{" "}
									{(e.durationSeconds / 3600).toFixed(2)} hours ·{" "}
									{e.workDate ?? "Running"}
								</p>
								{e.description && <p>{e.description}</p>}
							</div>
							{e.status === "draft" && (
								<Form
									action={reviewTimeAction}
									hidden={{ workspaceId, id: e.id }}
								>
									<Button name="target" value="approved">
										Approve
									</Button>
									<Button name="target" value="void" variant="destructive">
										Void
									</Button>
								</Form>
							)}
						</article>
					))
				)}
			</div>
		</section>
	);
}
function ProjectSelect({ projects }: { projects: Project[] }) {
	return (
		<NativeSelect name="projectId" required>
			<option value="">Choose project</option>
			{projects.map((p) => (
				<option key={p.id} value={p.id}>
					{p.name}
				</option>
			))}
		</NativeSelect>
	);
}
function TaskSelect({
	tasks,
}: {
	tasks: Array<{ id: string; title: string; project: string }>;
}) {
	return (
		<NativeSelect name="taskId">
			<option value="">No task</option>
			{tasks.map((t) => (
				<option key={t.id} value={t.id}>
					{t.project} — {t.title}
				</option>
			))}
		</NativeSelect>
	);
}
