"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type InviteMemberState,
	inviteMemberAction,
} from "../../_lib/team-actions";

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Inviting…" : "Send invite"}
		</Button>
	);
}

export function InviteForm() {
	const [state, action] = useActionState<InviteMemberState, FormData>(
		inviteMemberAction,
		{ error: null, invite: null },
	);
	const [origin, setOrigin] = useState("");
	const [copied, setCopied] = useState(false);

	// window.location is only available after mount; avoids an SSR/hydration mismatch.
	useEffect(() => setOrigin(window.location.origin), []);

	const link = state.invite ? `${origin}/join/${state.invite.token}` : "";

	return (
		<div className="space-y-4">
			<form action={action} className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor="invite-email">Email</Label>
					<Input
						id="invite-email"
						name="email"
						type="email"
						placeholder="teammate@example.com"
						required
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="invite-role">Role</Label>
					<select
						id="invite-role"
						name="role"
						defaultValue="member"
						className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
					>
						<option value="member">Member</option>
						<option value="admin">Admin</option>
					</select>
				</div>
				<SubmitButton />
			</form>

			{state.error && (
				<p role="alert" className="text-destructive text-sm">
					{state.error}
				</p>
			)}

			{state.invite && (
				<div className="rounded-xl border border-primary/40 bg-primary/[0.06] p-4">
					<p className="font-medium text-sm">
						Invite link for {state.invite.email}
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Copy it now — it's only shown once. Send it to them however you
						like; they accept by signing in and opening it. (Email delivery is
						coming.)
					</p>
					<div className="mt-3 flex items-center gap-2">
						<code className="flex-1 break-all rounded-lg border border-foreground/10 bg-background px-3 py-2 font-mono text-xs">
							{link || `…/join/${state.invite.token}`}
						</code>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								navigator.clipboard
									.writeText(link)
									.then(() => setCopied(true))
									.catch(() => setCopied(false));
							}}
						>
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
