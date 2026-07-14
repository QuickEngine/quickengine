"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	setWorkspaceModuleEnabledAction,
	type WorkspaceModuleState,
} from "../../../_lib/workspace-actions";

function SubmitButton({ enabled }: { enabled: boolean }) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant={enabled ? "outline" : "default"}
			disabled={pending}
		>
			{pending ? "Saving…" : enabled ? "Disable" : "Enable"}
		</Button>
	);
}

export function ModuleToggleForm({
	workspaceId,
	slug,
	moduleId,
	enabled,
}: {
	workspaceId: string;
	slug: string;
	moduleId: string;
	enabled: boolean;
}) {
	const initialState: WorkspaceModuleState = { error: null, success: false };
	const [state, action] = useActionState(
		setWorkspaceModuleEnabledAction,
		initialState,
	);

	return (
		<form action={action}>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="slug" value={slug} />
			<input type="hidden" name="moduleId" value={moduleId} />
			<input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
			<SubmitButton enabled={enabled} />
			{state.error && (
				<p role="alert" className="mt-2 max-w-48 text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}
