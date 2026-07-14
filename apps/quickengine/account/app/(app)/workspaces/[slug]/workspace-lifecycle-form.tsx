"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	setWorkspaceArchivedAction,
	type WorkspaceLifecycleState,
} from "../../../_lib/workspace-actions";

function SubmitButton({ archived }: { archived: boolean }) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant={archived ? "outline" : "destructive"}
			disabled={pending}
		>
			{pending
				? "Saving…"
				: archived
					? "Restore workspace"
					: "Archive workspace"}
		</Button>
	);
}

export function WorkspaceLifecycleForm({
	workspaceId,
	slug,
	archived,
}: {
	workspaceId: string;
	slug: string;
	archived: boolean;
}) {
	const initialState: WorkspaceLifecycleState = { error: null, success: false };
	const [state, action] = useActionState(
		setWorkspaceArchivedAction,
		initialState,
	);

	return (
		<form
			action={action}
			className="rounded-xl border border-foreground/[0.06] p-5"
		>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="slug" value={slug} />
			<input
				type="hidden"
				name="archived"
				value={archived ? "false" : "true"}
			/>
			<h2 className="font-medium">
				{archived ? "Restore workspace" : "Archive workspace"}
			</h2>
			<p className="mt-1 text-muted-foreground text-sm">
				{archived
					? "Restore this workspace to the active list. All of its data and settings are already intact."
					: "Archive this workspace without deleting its clients, invoices, payments, fulfillment records, or settings."}
			</p>
			<div className="mt-4">
				<SubmitButton archived={archived} />
			</div>
			{state.error && (
				<p role="alert" className="mt-3 text-destructive text-sm">
					{state.error}
				</p>
			)}
			{state.success && (
				<p role="status" className="mt-3 text-muted-foreground text-sm">
					Workspace status updated.
				</p>
			)}
		</form>
	);
}
