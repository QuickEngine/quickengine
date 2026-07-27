import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { activeOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

function NewOrganizationPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const create = useMutation({
		mutationFn: (name: string) =>
			api.request<{ id: string }>("/account/organizations", {
				method: "POST",
				body: { name },
			}),
		onSuccess: async ({ data }) => {
			activeOrganization.write(data.id);
			queryClient.setQueryData(["account", "activeOrganization"], data.id);
			await queryClient.invalidateQueries({
				queryKey: ["account", "organizations"],
			});
			await navigate({ to: "/" });
		},
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Creation failed."),
	});
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		create.mutate(String(new FormData(event.currentTarget).get("name") ?? ""));
	};
	return (
		<form onSubmit={submit} className="mx-auto max-w-lg space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Create organization</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Group workspaces, teammates, and billing under one organization.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="organization-name">Name</Label>
				<Input id="organization-name" name="name" required autoFocus />
			</div>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<Button disabled={create.isPending}>
				{create.isPending ? "Creating…" : "Create organization"}
			</Button>
		</form>
	);
}

export const Route = createFileRoute("/organizations/new")({
	component: NewOrganizationPage,
});
