"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type AcceptInviteState,
	acceptInviteAction,
} from "../../_lib/team-actions";

function AcceptButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Joining…" : "Accept invitation"}
		</Button>
	);
}

export function AcceptForm({ token }: { token: string }) {
	const [state, action] = useActionState<AcceptInviteState, FormData>(
		acceptInviteAction,
		{ error: null, success: false },
	);

	if (state.success) {
		return (
			<p className="text-sm">
				You've joined.{" "}
				<a href="/team" className="underline">
					Go to your team
				</a>
				.
			</p>
		);
	}

	return (
		<form action={action} className="space-y-3">
			<input type="hidden" name="token" value={token} />
			<AcceptButton />
			{state.error && (
				<p role="alert" className="text-destructive text-sm">
					{state.error}
				</p>
			)}
		</form>
	);
}
