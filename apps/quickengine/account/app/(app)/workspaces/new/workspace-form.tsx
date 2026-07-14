"use client";

import { Check, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type CreateWorkspaceState,
	createWorkspaceAction,
} from "../../../_lib/workspace-actions";
import { BUSINESS_TYPE_CATALOG } from "../../../_lib/workspace-catalog";

const INITIAL_STATE: CreateWorkspaceState = { error: null };

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Creating workspace…" : "Create workspace"}
		</Button>
	);
}

export function NewWorkspaceForm() {
	const [state, action] = useActionState(createWorkspaceAction, INITIAL_STATE);
	const [query, setQuery] = useState("");
	const [businessType, setBusinessType] = useState("ecommerce");
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

	return (
		<form action={action} className="mx-auto max-w-4xl space-y-8 p-6">
			<input type="hidden" name="businessType" value={businessType} />
			<input type="hidden" name="creationMode" value={creationMode} />

			<div>
				<h1 className="font-semibold text-2xl text-foreground">
					Create a workspace
				</h1>
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
							Start from the selected business type. Richer recommendations
							arrive as optional modules are built.
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
							Begin with the four foundation modules. Optional selection is
							added as those modules become available.
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
					{visibleTypes.length === 0 && (
						<p className="col-span-full p-6 text-center text-muted-foreground text-sm">
							No business types match “{query.trim()}”. Custom configuration can
							still support it as the catalog grows.
						</p>
					)}
				</div>
			</fieldset>

			{state.error && (
				<p role="alert" className="text-destructive text-sm">
					{state.error}
				</p>
			)}

			<div className="flex justify-end gap-3 border-foreground/10 border-t pt-5">
				<Button asChild variant="outline">
					<Link href="/">Cancel</Link>
				</Button>
				<SubmitButton />
			</div>
		</form>
	);
}
