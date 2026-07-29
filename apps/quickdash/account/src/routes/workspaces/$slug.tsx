import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import {
	type CredentialPurpose,
	credentialPresets,
} from "../../lib/credential-presets";
import { clientEnv } from "../../lib/env";
import { getBusinessType } from "../../lib/workspace-catalog";

const createdDate = (value: string) =>
	new Intl.DateTimeFormat("en", {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value));
const settingValue = (value: unknown) => {
	if (typeof value === "boolean") return value ? "On" : "Off";
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	return JSON.stringify(value);
};

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
	const modules = useQuery({
		queryKey: ["account", active?.id, "workspaces", workspace?.id, "modules"],
		queryFn: async () =>
			(
				await api.request<{
					items: Array<{
						id: string;
						name: string;
						description: string;
						enabled: boolean;
						settings: Record<string, unknown>;
					}>;
				}>(
					`/account/workspaces/${workspace?.id}/modules?organizationId=${active?.id}`,
				)
			).data.items,
		enabled: Boolean(active?.id && workspace?.id),
	});
	const [error, setError] = useState<string | null>(null);
	const [plaintextKey, setPlaintextKey] = useState<string | null>(null);
	const [keyType, setKeyType] = useState<"publishable" | "secret" | "scoped">(
		"publishable",
	);
	const [credentialPurpose, setCredentialPurpose] =
		useState<CredentialPurpose>("public-storefront");
	const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(
		[],
	);
	const capabilities = useQuery({
		queryKey: ["account", "apiCapabilities"],
		queryFn: async () =>
			(await api.request<{ items: string[] }>("/account/api-capabilities")).data
				.items,
	});
	useEffect(() => {
		if (!capabilities.data) return;
		const preset = credentialPresets[credentialPurpose];
		setKeyType(preset.type);
		setSelectedCapabilities(preset.selectCapabilities(capabilities.data));
	}, [capabilities.data, credentialPurpose]);
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
		mutationFn: (input: {
			name: string;
			type: "publishable" | "secret" | "scoped";
			capabilities: string[];
			expiresAt?: string;
		}) =>
			api.request<{ plaintext: string }>(
				`/account/api-keys?organizationId=${active?.id}`,
				{
					method: "POST",
					body: {
						workspaceId: workspace?.id,
						...input,
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
	const toggleModule = useMutation({
		mutationFn: (input: { id: string; enabled: boolean }) =>
			api.request(
				`/account/workspaces/${workspace?.id}/modules/${input.id}?organizationId=${active?.id}`,
				{ method: "PUT", body: { enabled: input.enabled } },
			),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: [
					"account",
					active?.id,
					"workspaces",
					workspace?.id,
					"modules",
				],
			}),
		onError: (cause) =>
			setError(
				cause instanceof Error ? cause.message : "Module update failed.",
			),
	});

	if (workspaces.isPending)
		return <main className="p-6">Loading workspace…</main>;
	if (workspaces.isError) throw workspaces.error;
	if (!workspace) return <main className="p-6">Workspace not found.</main>;
	const businessType =
		getBusinessType(workspace.businessType)?.name ?? workspace.businessType;

	const submitRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		rename.mutate(String(data.get("name") ?? ""));
	};

	return (
		<main className="space-y-8 p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-sm">{businessType}</p>
					<h1 className="mt-1 font-semibold text-2xl">{workspace.name}</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Created {createdDate(workspace.createdAt)}
					</p>
				</div>
				<div className="flex gap-2">
					{!workspace.archivedAt && (
						<Button asChild>
							<a href={`${clientEnv.DASH_URL}/${workspace.id}`}>
								Enter {workspace.name}
							</a>
						</Button>
					)}
					<Button asChild variant="outline">
						<Link to="/">Back to workspaces</Link>
					</Button>
				</div>
			</div>
			{workspace.archivedAt && (
				<div className="rounded-xl border border-foreground/10 bg-foreground/[0.04] p-4 text-sm">
					This workspace is archived. Its data and module settings are
					preserved, but it is outside the active workspace list until restored.
				</div>
			)}
			<section className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-foreground/[0.06] p-4">
					<p className="text-muted-foreground text-xs">Stable slug</p>
					<p className="mt-1 break-all font-medium text-sm">{workspace.slug}</p>
				</div>
				<div className="rounded-xl border border-foreground/[0.06] p-4">
					<p className="text-muted-foreground text-xs">Business type</p>
					<p className="mt-1 font-medium text-sm">{businessType}</p>
				</div>
				<div className="rounded-xl border border-foreground/[0.06] p-4">
					<p className="text-muted-foreground text-xs">Modules</p>
					<p className="mt-1 font-medium text-sm">
						{modules.data?.filter((module) => module.enabled).length ?? 0}{" "}
						enabled
					</p>
				</div>
			</section>
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
				<p className="text-muted-foreground text-sm">
					Archive keeps every record and can be reversed. If this was only a
					test workspace, archive it first to reveal the permanent discard
					option.
				</p>
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
				<p className="text-muted-foreground text-sm">
					Workspace-scoped credentials for the public API and Quick.js.
					Publishable keys are browser-safe; secret and scoped keys belong on
					trusted servers.
				</p>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const expiry = Number(form.get("expiry") ?? 0);
						createKey.mutate({
							name: String(form.get("keyName") ?? ""),
							type: keyType,
							capabilities: selectedCapabilities,
							...(expiry > 0
								? {
										expiresAt: new Date(
											Date.now() + expiry * 86_400_000,
										).toISOString(),
									}
								: {}),
						});
					}}
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<Input
							name="keyName"
							placeholder="Gemsutopia storefront"
							required
						/>
						<select
							value={credentialPurpose}
							onChange={(event) =>
								setCredentialPurpose(event.target.value as CredentialPurpose)
							}
							className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
						>
							{Object.entries(credentialPresets).map(([value, preset]) => (
								<option key={value} value={value}>
									{preset.label}
								</option>
							))}
						</select>
						{credentialPurpose === "custom" && (
							<select
								value={keyType}
								onChange={(event) =>
									setKeyType(
										event.target.value as "publishable" | "secret" | "scoped",
									)
								}
								className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
							>
								<option value="publishable">Publishable</option>
								<option value="secret">Secret</option>
								<option value="scoped">Scoped</option>
							</select>
						)}
						<select
							name="expiry"
							defaultValue="0"
							className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
						>
							<option value="0">Never expires</option>
							<option value="30">In 30 days</option>
							<option value="90">In 90 days</option>
							<option value="365">In 365 days</option>
						</select>
					</div>
					<p className="text-muted-foreground text-sm">
						{credentialPresets[credentialPurpose].description}
					</p>
					<fieldset className="grid max-h-48 gap-2 overflow-y-auto">
						<legend className="mb-2 text-sm">Capabilities</legend>
						{capabilities.data?.map((capability) => (
							<label
								key={capability}
								className="flex items-center gap-2 text-sm"
							>
								<input
									type="checkbox"
									name="capability"
									value={capability}
									checked={selectedCapabilities.includes(capability)}
									disabled={
										credentialPurpose !== "custom" ||
										(keyType === "publishable" &&
											!["catalog:read", "events:write"].includes(capability))
									}
									onChange={(event) =>
										setSelectedCapabilities((current) =>
											event.target.checked
												? [...new Set([...current, capability])]
												: current.filter((item) => item !== capability),
										)
									}
								/>
								<code className="font-mono text-xs">{capability}</code>
							</label>
						))}
					</fieldset>
					<Button
						disabled={createKey.isPending || Boolean(workspace.archivedAt)}
					>
						Create key
					</Button>
				</form>
				{plaintextKey && (
					<div className="rounded-lg bg-foreground/5 p-3">
						<p className="text-sm">Copy this key now. It is shown only once.</p>
						<code className="mt-2 block break-all text-xs">{plaintextKey}</code>
					</div>
				)}
				{apiKeys.data?.items.map((key) => (
					<div key={key.id} className="flex items-center justify-between">
						<div>
							<p className="text-sm">
								{key.name} · {key.type} · {key.prefix}
								{key.revokedAt ? " · revoked" : ""}
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{key.capabilities.join(", ") || "No capabilities"} · Last used{" "}
								{key.lastUsedAt
									? new Date(key.lastUsedAt).toLocaleDateString()
									: "never"}
							</p>
						</div>
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
			<section>
				<div>
					<h2 className="font-medium text-lg">Workspace modules</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						This is the canonical configuration QuickDash will render for this
						workspace.
					</p>
				</div>
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					{modules.data?.map((module) => (
						<article
							key={module.id}
							className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5"
						>
							<div className="flex items-start justify-between gap-3">
								<div>
									<h3 className="font-medium">{module.name}</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										{module.description}
									</p>
								</div>
								<div className="flex shrink-0 flex-col items-end gap-2">
									<span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground">
										{module.enabled ? "Enabled" : "Disabled"}
									</span>
									<Button
										size="sm"
										variant="outline"
										disabled={
											Boolean(workspace.archivedAt) || toggleModule.isPending
										}
										onClick={() =>
											toggleModule.mutate({
												id: module.id,
												enabled: !module.enabled,
											})
										}
									>
										{module.enabled ? "Disable" : "Enable"}
									</Button>
								</div>
							</div>
							<dl className="mt-4 grid gap-2 border-foreground/[0.06] border-t pt-4 text-sm">
								{Object.entries(module.settings).map(([key, value]) => (
									<div key={key} className="flex justify-between gap-4">
										<dt className="text-muted-foreground">{key}</dt>
										<dd className="text-right">{settingValue(value)}</dd>
									</div>
								))}
							</dl>
						</article>
					))}
				</div>
			</section>
			{workspace.archivedAt && (
				<section className="space-y-3 rounded-xl border border-destructive/30 p-5">
					<h2 className="font-medium text-destructive">Danger zone</h2>
					<p className="text-muted-foreground text-sm">
						Discard this workspace only when all of its records are disposable.
						This permanently removes the workspace and its business data and
						cannot be undone.
					</p>
					<Button
						variant="destructive"
						disabled={remove.isPending}
						onClick={() => {
							if (
								window.confirm(
									`Permanently discard ${workspace.name} and all of its data? This cannot be undone.`,
								)
							) {
								remove.mutate();
							}
						}}
					>
						Discard workspace and all data
					</Button>
				</section>
			)}
			{error && <p className="text-destructive text-sm">{error}</p>}
		</main>
	);
}

export const Route = createFileRoute("/workspaces/$slug")({
	component: WorkspacePage,
});
