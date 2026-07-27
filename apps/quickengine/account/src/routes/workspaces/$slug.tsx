import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

function WorkspacePage() {
	const { slug } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { active } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));
	const workspace = workspaces.data?.items.find(
		(item) => item.slug === slug || item.id === slug,
	);
	const apiKeys = useQuery(
		accountQueries.apiKeys(active?.id ?? "", workspace?.id ?? ""),
	);
	const [error, setError] = useState<string | null>(null);
	const [plaintextKey, setPlaintextKey] = useState<string | null>(null);
	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: ["account", active?.id, "workspaces"],
		});
	const rename = useMutation({
		mutationFn: (name: string) =>
			api.request(
				`/account/workspaces/${workspace?.id}?organizationId=${active?.id}`,
				{
					method: "PATCH",
					body: { name },
				},
			),
		onSuccess: invalidate,
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Rename failed."),
	});
	const archive = useMutation({
		mutationFn: (archived: boolean) =>
			api.request(
				`/account/workspaces/${workspace?.id}/archive?organizationId=${active?.id}`,
				{ method: "POST", body: { archived } },
			),
		onSuccess: invalidate,
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Update failed."),
	});
	const remove = useMutation({
		mutationFn: () =>
			api.request(
				`/account/workspaces/${workspace?.id}?organizationId=${active?.id}`,
				{ method: "DELETE" },
			),
		onSuccess: async () => {
			await invalidate();
			await navigate({ to: "/" });
		},
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Delete failed."),
	});
	const createKey = useMutation({
		mutationFn: (name: string) =>
			api.request<{ plaintext: string }>(
				`/account/api-keys?organizationId=${active?.id}`,
				{
					method: "POST",
					body: {
						workspaceId: workspace?.id,
						name,
						type: "secret",
						capabilities: ["clients:read"],
					},
				},
			),
		onSuccess: async ({ data }) => {
			setPlaintextKey(data.plaintext);
			await queryClient.invalidateQueries({
				queryKey: ["account", active?.id, "apiKeys", workspace?.id],
			});
		},
		onError: (cause) =>
			setError(cause instanceof Error ? cause.message : "Key creation failed."),
	});
	const revokeKey = useMutation({
		mutationFn: (keyId: string) =>
			api.request(
				`/account/api-keys/${keyId}?${new URLSearchParams({
					organizationId: active?.id ?? "",
					workspaceId: workspace?.id ?? "",
				})}`,
				{ method: "DELETE" },
			),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["account", active?.id, "apiKeys", workspace?.id],
			}),
	});

	if (workspaces.isPending)
		return <main className="p-6">Loading workspace…</main>;
	if (workspaces.isError) throw workspaces.error;
	if (!workspace) return <main className="p-6">Workspace not found.</main>;

	const submitRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		rename.mutate(String(data.get("name") ?? ""));
	};

	return (
		<main className="mx-auto max-w-3xl space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">{workspace.name}</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					{workspace.businessType} · {workspace.slug}
				</p>
			</div>
			<form
				onSubmit={submitRename}
				className="space-y-3 rounded-xl border border-foreground/10 p-5"
			>
				<h2 className="font-medium">Workspace name</h2>
				<div className="flex gap-3">
					<Input name="name" defaultValue={workspace.name} required />
					<Button type="submit" disabled={rename.isPending}>
						Save
					</Button>
				</div>
			</form>
			<section className="space-y-3 rounded-xl border border-foreground/10 p-5">
				<h2 className="font-medium">Lifecycle</h2>
				<Button
					variant="outline"
					disabled={archive.isPending}
					onClick={() => archive.mutate(!workspace.archivedAt)}
				>
					{workspace.archivedAt ? "Restore workspace" : "Archive workspace"}
				</Button>
			</section>
			<section className="space-y-4 rounded-xl border border-foreground/10 p-5">
				<h2 className="font-medium">API keys</h2>
				<form
					className="flex gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						createKey.mutate(
							String(new FormData(event.currentTarget).get("keyName") ?? ""),
						);
					}}
				>
					<Input name="keyName" placeholder="Key name" required />
					<Button disabled={createKey.isPending}>Create secret key</Button>
				</form>
				{plaintextKey && (
					<div className="rounded-lg bg-foreground/5 p-3">
						<p className="text-sm">Copy this key now. It is shown only once.</p>
						<code className="mt-2 block break-all text-xs">{plaintextKey}</code>
					</div>
				)}
				{apiKeys.data?.items.map((key) => (
					<div key={key.id} className="flex items-center justify-between">
						<p className="text-sm">
							{key.name} · {key.prefix} {key.revokedAt ? "· revoked" : ""}
						</p>
						{!key.revokedAt && (
							<Button
								variant="outline"
								onClick={() => revokeKey.mutate(key.id)}
							>
								Revoke
							</Button>
						)}
					</div>
				))}
			</section>
			<section className="space-y-3 rounded-xl border border-destructive/30 p-5">
				<h2 className="font-medium text-destructive">Danger zone</h2>
				<Button
					variant="destructive"
					disabled={remove.isPending}
					onClick={() => {
						if (window.confirm(`Permanently delete ${workspace.name}?`)) {
							remove.mutate();
						}
					}}
				>
					Delete workspace
				</Button>
			</section>
			{error && <p className="text-destructive text-sm">{error}</p>}
		</main>
	);
}

export const Route = createFileRoute("/workspaces/$slug")({
	component: WorkspacePage,
});
