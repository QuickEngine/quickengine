import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { api } from "../lib/api";

function OnboardingPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const create = useMutation({
		mutationFn: (name: string) =>
			api.request("/account/workspaces", {
				method: "POST",
				body: { name, businessType: "other" },
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["account"] });
			await navigate({ to: "/" });
		},
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Setup failed."),
	});
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		create.mutate(String(new FormData(event.currentTarget).get("name") ?? ""));
	};
	return (
		<form onSubmit={submit} className="mx-auto max-w-xl space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-3xl">Create your first workspace</h1>
				<p className="mt-2 text-muted-foreground">
					Start with the foundation modules. You can configure everything else
					afterward.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="first-workspace">Workspace name</Label>
				<Input id="first-workspace" name="name" required autoFocus />
			</div>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<Button disabled={create.isPending}>
				{create.isPending ? "Creating…" : "Create workspace"}
			</Button>
		</form>
	);
}

export const Route = createFileRoute("/onboarding")({
	validateSearch: z.object({ prompt: z.string().optional() }),
	component: OnboardingPage,
});
