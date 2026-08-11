import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import { BUSINESS_TYPE_CATALOG } from "../../lib/workspace-catalog";

function NewWorkspacePage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { active } = useActiveOrganization();
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [businessType, setBusinessType] = useState("ecommerce");
	const [environment, setEnvironment] = useState<"test" | "live">("live");
	const [creationMode, setCreationMode] = useState<"preset" | "custom">(
		"preset",
	);
	const normalizedQuery = query.trim().toLowerCase();
	const visibleTypes = BUSINESS_TYPE_CATALOG.filter((entry) =>
		[entry.name, entry.description, ...entry.keywords]
			.join(" ")
			.toLowerCase()
			.includes(normalizedQuery),
	);
	const createWorkspace = useMutation({
		mutationFn: (input: {
			name: string;
			businessType: string;
			environment: "test" | "live";
		}) =>
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
			businessType,
			environment,
		});
	};

	return (
		<form onSubmit={submit} className="mx-auto max-w-4xl space-y-8 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Create a workspace</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Start another business backend with the permanent foundation already
					configured.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="workspace-name">Workspace name</Label>
				<Input
					id="workspace-name"
					name="name"
					maxLength={120}
					placeholder="Acme Printing"
					required
					autoFocus
				/>
			</div>
			<fieldset className="space-y-3">
				<legend className="font-medium text-sm">Environment</legend>
				<div className="grid gap-3 sm:grid-cols-2">
					{(["live", "test"] as const).map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => setEnvironment(value)}
							className={`rounded-xl border p-4 text-left ${environment === value ? "border-foreground/30 bg-foreground/[0.05]" : "border-foreground/10"}`}
						>
							<p className="font-medium text-sm">
								{value === "live" ? "Live business" : "Test workspace"}
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{value === "live"
									? "Real customers, orders and provider accounts."
									: "Sandbox providers and disposable test orders only."}
							</p>
						</button>
					))}
				</div>
			</fieldset>
			<fieldset className="space-y-3">
				<legend className="font-medium text-sm">How should it start?</legend>
				<div className="grid gap-3 md:grid-cols-3">
					<button
						type="button"
						onClick={() => setCreationMode("preset")}
						className={`rounded-xl border p-4 text-left ${creationMode === "preset" ? "border-foreground/30 bg-foreground/[0.05]" : "border-foreground/10"}`}
					>
						<div className="flex items-center justify-between">
							<span className="font-medium text-sm">Business preset</span>
							{creationMode === "preset" && <Check className="size-4" />}
						</div>
						<p className="mt-2 text-muted-foreground text-xs">
							Start from the selected business type.
						</p>
					</button>
					<button
						type="button"
						onClick={() => setCreationMode("custom")}
						className={`rounded-xl border p-4 text-left ${creationMode === "custom" ? "border-foreground/30 bg-foreground/[0.05]" : "border-foreground/10"}`}
					>
						<div className="flex items-center justify-between">
							<span className="font-medium text-sm">Custom configuration</span>
							{creationMode === "custom" && <Check className="size-4" />}
						</div>
						<p className="mt-2 text-muted-foreground text-xs">
							Begin with the four foundation modules.
						</p>
					</button>
					<div className="rounded-xl border border-foreground/10 p-4 opacity-55">
						<div className="flex items-center gap-2 font-medium text-sm">
							<Sparkle className="size-4" /> AI-assisted
						</div>
						<p className="mt-2 text-muted-foreground text-xs">
							Coming next: describe the business and review a generated
							proposal.
						</p>
					</div>
				</div>
			</fieldset>
			<fieldset className="space-y-3">
				<legend className="font-medium text-sm">Business type</legend>
				<div className="relative">
					<MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search printing, restaurant, trades, photography…"
						className="pl-9"
					/>
				</div>
				<div className="grid max-h-80 gap-2 overflow-y-auto rounded-xl border border-foreground/10 p-2 sm:grid-cols-2">
					{visibleTypes.map((entry) => (
						<button
							key={entry.id}
							type="button"
							onClick={() => setBusinessType(entry.id)}
							className={`rounded-lg p-3 text-left ${businessType === entry.id ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.04]"}`}
						>
							<div className="flex items-center justify-between gap-3">
								<span className="font-medium text-sm">{entry.name}</span>
								{businessType === entry.id && <Check className="size-4" />}
							</div>
							<p className="mt-1 text-muted-foreground text-xs">
								{entry.description}
							</p>
						</button>
					))}
				</div>
			</fieldset>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<div className="flex justify-end gap-3 border-foreground/10 border-t pt-5">
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

import { Check, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
