"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type DeleteWorkspaceState,
	deleteWorkspaceAction,
} from "../../../_lib/workspace-actions";

function DeleteButton({ confirmed }: { confirmed: boolean }) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant="destructive"
			disabled={pending || !confirmed}
		>
			{pending ? "Deleting…" : "Permanently delete workspace"}
		</Button>
	);
}

export function DeleteWorkspaceForm({
	workspaceId,
	slug,
	name,
}: {
	workspaceId: string;
	slug: string;
	name: string;
}) {
	const initialState: DeleteWorkspaceState = { error: null };
	const [state, action] = useActionState(deleteWorkspaceAction, initialState);
	const [confirmation, setConfirmation] = useState("");

	return (
		<form
			action={action}
			className="rounded-xl border border-destructive/30 p-5"
		>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="slug" value={slug} />
			<h2 className="font-medium text-destructive">
				Permanently delete workspace
			</h2>
			<p className="mt-1 text-muted-foreground text-sm">
				This permanently deletes the workspace, its module configuration,
				clients, invoices, payments, and fulfillment records. This cannot be
				undone.
			</p>
			<div className="mt-4 max-w-md space-y-2">
				<Label htmlFor="workspace-delete-confirmation">
					Type <span className="font-semibold text-foreground">{name}</span> to
					confirm
				</Label>
				<Input
					id="workspace-delete-confirmation"
					name="confirmation"
					value={confirmation}
					onChange={(event) => setConfirmation(event.target.value)}
					autoComplete="off"
				/>
			</div>
			<div className="mt-4">
				<DeleteButton confirmed={confirmation === name} />
			</div>
			{state.error && (
				<p role="alert" className="mt-3 text-destructive text-sm">
					{state.error}
				</p>
			)}
		</form>
	);
}
