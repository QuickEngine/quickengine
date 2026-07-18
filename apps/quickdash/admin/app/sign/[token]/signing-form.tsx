"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	declineAction,
	type SigningActionState,
	signAction,
} from "./sign-actions";

const INITIAL: SigningActionState = { error: null, done: null };

function SubmitButton({
	label,
	variant = "default",
}: {
	label: string;
	variant?: "default" | "outline";
}) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" variant={variant} disabled={pending}>
			{pending ? "Working…" : label}
		</Button>
	);
}

export function SigningForm({
	token,
	consentText,
	signerName,
}: {
	token: string;
	consentText: string;
	signerName: string;
}) {
	const [signState, sign] = useActionState(signAction, INITIAL);
	const [declineState, decline] = useActionState(declineAction, INITIAL);
	const done = signState.done ?? declineState.done;

	if (done === "signed") {
		return (
			<div className="rounded-xl border border-green-600/30 bg-green-600/[0.06] p-6 text-center">
				<h2 className="font-medium text-lg">Signed — thank you</h2>
				<p className="mt-2 text-muted-foreground text-sm">
					Your signature has been recorded. You can close this page.
				</p>
			</div>
		);
	}
	if (done === "declined") {
		return (
			<div className="rounded-xl border p-6 text-center">
				<h2 className="font-medium text-lg">Declined</h2>
				<p className="mt-2 text-muted-foreground text-sm">
					You declined to sign this agreement. You can close this page.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<form action={sign} className="space-y-4 rounded-xl border p-5">
				<input type="hidden" name="token" value={token} />
				<div className="space-y-2">
					<Label>Full legal name</Label>
					<Input
						name="typedName"
						defaultValue={signerName}
						maxLength={200}
						required
						autoComplete="name"
					/>
				</div>
				<label className="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						name="consent"
						required
						className="mt-1 size-4"
					/>
					<span>{consentText}</span>
				</label>
				{signState.error && (
					<p role="alert" className="text-destructive text-sm">
						{signState.error}
					</p>
				)}
				<SubmitButton label="Sign agreement" />
			</form>
			<form action={decline}>
				<input type="hidden" name="token" value={token} />
				<SubmitButton label="Decline to sign" variant="outline" />
				{declineState.error && (
					<p role="alert" className="mt-2 text-destructive text-sm">
						{declineState.error}
					</p>
				)}
			</form>
		</div>
	);
}
