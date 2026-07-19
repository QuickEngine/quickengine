"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type CreateOrgState,
	createOrgAction,
} from "../../../_lib/org-actions";

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Creating…" : "Create organization"}
		</Button>
	);
}

export function CreateOrgForm() {
	const [state, action] = useActionState<CreateOrgState, FormData>(
		createOrgAction,
		{ error: null },
	);
	return (
		<form action={action} className="space-y-4">
			<div className="grid gap-2">
				<Label htmlFor="org-name">Organization name</Label>
				<Input
					id="org-name"
					name="name"
					placeholder="QuickEngine Software"
					maxLength={120}
					required
				/>
			</div>
			<SubmitButton />
			{state.error && (
				<p role="alert" className="text-destructive text-sm">
					{state.error}
				</p>
			)}
		</form>
	);
}
