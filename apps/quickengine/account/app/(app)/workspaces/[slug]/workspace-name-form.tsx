"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type RenameWorkspaceState,
	renameWorkspaceAction,
} from "../../../_lib/workspace-actions";

function SaveButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending} variant="outline">
			{pending ? "Saving…" : "Save name"}
		</Button>
	);
}

export function WorkspaceNameForm({
	workspaceId,
	slug,
	name,
}: {
	workspaceId: string;
	slug: string;
	name: string;
}) {
	const initialState: RenameWorkspaceState = { error: null, success: false };
	const [state, action] = useActionState(renameWorkspaceAction, initialState);

	return (
		<form
			action={action}
			className="rounded-xl border border-foreground/[0.06] p-5"
		>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="slug" value={slug} />
			<div>
				<h2 className="font-medium">Workspace name</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Renaming changes the display name only. The stable slug and future
					connections will not move.
				</p>
			</div>
			<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
				<div className="flex-1 space-y-2">
					<Label htmlFor="workspace-display-name">Display name</Label>
					<Input
						id="workspace-display-name"
						name="name"
						defaultValue={name}
						maxLength={120}
						required
					/>
				</div>
				<SaveButton />
			</div>
			{state.error && (
				<p role="alert" className="mt-3 text-destructive text-sm">
					{state.error}
				</p>
			)}
			{state.success && (
				<p role="status" className="mt-3 text-muted-foreground text-sm">
					Workspace name updated. Its slug is unchanged.
				</p>
			)}
		</form>
	);
}
