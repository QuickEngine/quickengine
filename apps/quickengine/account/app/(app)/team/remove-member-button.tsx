"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { useActionState } from "react";
import {
	type RemoveMemberState,
	removeMemberAction,
} from "../../_lib/team-actions";

export function RemoveMemberButton({ userId }: { userId: string }) {
	const [state, action] = useActionState<RemoveMemberState, FormData>(
		removeMemberAction,
		{ error: null },
	);
	return (
		<form action={action} className="flex flex-col items-end gap-1">
			<input type="hidden" name="userId" value={userId} />
			<Button type="submit" variant="outline" size="sm">
				Remove
			</Button>
			{state.error && (
				<p role="alert" className="text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}
