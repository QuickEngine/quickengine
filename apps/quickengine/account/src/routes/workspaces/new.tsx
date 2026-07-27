import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

function NewWorkspacePage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { active } = useActiveOrganization();
	const [error, setError] = useState<string | null>(null);
	const createWorkspace = useMutation({
		mutationFn: (input: { name: string; businessType: string }) =>
			api.request<{ slug: string }>("/account/workspaces", {
				method: "POST",
				body: { ...input, organizationId: active?.id },
			}),
		onSuccess: async ({ data }) => {
			await queryClient.invalidateQueries({
				queryKey: ["account", active?.id, "workspaces"],
			});
			await navigate({
				to: "/workspaces/$slug",
				params: { slug: data.slug },
			});
		},
		onError: (cause) =>
			setError(
				cause instanceof Error ? cause.message : "Workspace creation failed.",
			),
	});

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		const data = new FormData(event.currentTarget);
		createWorkspace.mutate({
			name: String(data.get("name") ?? ""),
			businessType: String(data.get("businessType") ?? "other"),
		});
	};

	return (
		<form onSubmit={submit} className="mx-auto max-w-xl space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Create a workspace</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Start a business backend in {active?.name ?? "your organization"}.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="name">Workspace name</Label>
				<Input id="name" name="name" maxLength={120} required autoFocus />
			</div>
			<div className="space-y-2">
				<Label htmlFor="businessType">Business type</Label>
				<Input
					id="businessType"
					name="businessType"
					defaultValue="ecommerce"
					required
				/>
			</div>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<div className="flex justify-end gap-3">
				<Button asChild variant="outline">
					<Link to="/">Cancel</Link>
				</Button>
				<Button type="submit" disabled={createWorkspace.isPending}>
					{createWorkspace.isPending ? "Creating…" : "Create workspace"}
				</Button>
			</div>
		</form>
	);
}

export const Route = createFileRoute("/workspaces/new")({
	component: NewWorkspacePage,
});
