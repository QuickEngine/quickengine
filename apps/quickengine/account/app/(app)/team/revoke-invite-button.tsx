"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { useActionState } from "react";
import {
	type RevokeInviteState,
	revokeInviteAction,
} from "../../_lib/team-actions";

export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
	const [state, action] = useActionState<RevokeInviteState, FormData>(
		revokeInviteAction,
		{ error: null },
	);
	return (
		<form action={action} className="flex flex-col items-end gap-1">
			<input type="hidden" name="invitationId" value={invitationId} />
			<Button type="submit" variant="outline" size="sm">
				Revoke
			</Button>
			{state.error && (
				<p role="alert" className="text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}
