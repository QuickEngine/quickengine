"use client";

import { CheckCircle, Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@quickengine/ui/components/ui/empty";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { Switch } from "@quickengine/ui/components/ui/switch";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { workspaceApi } from "../lib/api";

/**
 * The words on a workspace's own website.
 *
 * 🔴 This module does NOT model pages. A developer declares named slots from
 * their site; the operator fills them in. So this view renders a FORM DESCRIBED
 * BY DATA — `label`, `description`, `group`, `type` and `kind` are the entire
 * spec, and a slot this file has never heard of still renders correctly.
 *
 * That is the whole point: the client can rewrite every word and cannot break
 * the layout, because layout was never theirs to touch.
 */

export type ContentEntry = {
	key: string;
	type: "text" | "richtext" | "image" | "url" | "number" | "boolean" | "json";
	kind: "single" | "list";
	value: unknown;
	published: boolean;
	label: string | null;
	description: string | null;
	group: string | null;
	updatedAt: string;
};

/** A list, or any `json` slot, is edited as JSON. See the note in the editor. */
const isStructured = (entry: ContentEntry) =>
	entry.kind === "list" || entry.type === "json";

/** What goes in the textarea/input for a given slot. */
function toEditable(entry: ContentEntry): string {
	if (isStructured(entry)) {
		return JSON.stringify(entry.value ?? [], null, 2);
	}
	if (entry.value === null || entry.value === undefined) return "";
	return String(entry.value);
}

/** Back to whatever the API should store. Throws on invalid JSON. */
function fromEditable(entry: ContentEntry, draft: string): unknown {
	if (isStructured(entry)) return JSON.parse(draft);
	if (entry.type === "number") return draft === "" ? null : Number(draft);
	if (entry.type === "boolean") return draft === "true";
	return draft;
}

/** Multi-line editing for anything that is prose or structure. */
const wantsTextarea = (entry: ContentEntry) =>
	isStructured(entry) ||
	entry.type === "richtext" ||
	(entry.type === "text" && toEditable(entry).length > 60);

export function ContentView({
	workspaceId,
	entries,
}: {
	workspaceId: string;
	entries: ContentEntry[];
}) {
	const queryClient = useQueryClient();
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saved, setSaved] = useState<Record<string, boolean>>({});

	/**
	 * Grouped exactly as the developer declared. Slots with no group land in
	 * "Other" rather than vanishing, because a missing group is a manifest
	 * oversight and hiding the slot would make it unfixable from here.
	 */
	const groups = useMemo(() => {
		const map = new Map<string, ContentEntry[]>();
		for (const entry of [...entries].sort((a, b) =>
			a.key.localeCompare(b.key),
		)) {
			const name = entry.group?.trim() || "Other";
			const bucket = map.get(name);
			if (bucket) bucket.push(entry);
			else map.set(name, [entry]);
		}
		return [...map.entries()];
	}, [entries]);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "content"],
		});

	const save = useMutation({
		mutationFn: async ({
			entry,
			value,
		}: {
			entry: ContentEntry;
			value: unknown;
		}) => {
			await workspaceApi(workspaceId).request(
				`/content/manage/${encodeURIComponent(entry.key)}`,
				{
					method: "PUT",
					body: {
						type: entry.type,
						kind: entry.kind,
						label: entry.label,
						description: entry.description,
						group: entry.group,
						value,
					},
				},
			);
			return entry.key;
		},
		onSuccess: async (key) => {
			setDrafts((current) => {
				const next = { ...current };
				delete next[key];
				return next;
			});
			setSaved((current) => ({ ...current, [key]: true }));
			// Cleared on the next edit; a permanent tick stops meaning anything.
			setTimeout(
				() => setSaved((current) => ({ ...current, [key]: false })),
				2000,
			);
			await invalidate();
		},
		onError: (cause, variables) =>
			setErrors((current) => ({
				...current,
				[variables.entry.key]:
					cause instanceof Error ? cause.message : "Could not save that.",
			})),
	});

	const setPublished = useMutation({
		mutationFn: async ({
			key,
			published,
		}: {
			key: string;
			published: boolean;
		}) => {
			await workspaceApi(workspaceId).request("/content/manage/publish", {
				method: "POST",
				body: { keys: [key], published },
			});
		},
		onSuccess: invalidate,
	});

	if (entries.length === 0) {
		return (
			<main className="p-6">
				<h1 className="text-2xl font-semibold tracking-tight">Content</h1>
				<Empty className="mt-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Warning />
						</EmptyMedia>
						<EmptyTitle>No editable slots yet</EmptyTitle>
						<EmptyDescription>
							A developer declares which parts of your website you can edit, and
							they will appear here. Nothing has been declared for this
							workspace yet.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</main>
		);
	}

	const draftedCount = Object.keys(drafts).length;

	return (
		<main className="p-6">
			<div className="flex items-baseline justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Content</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						The words on your website. Changes go live once published.
					</p>
				</div>
				{draftedCount > 0 && (
					<Badge variant="secondary">
						{draftedCount} unsaved {draftedCount === 1 ? "change" : "changes"}
					</Badge>
				)}
			</div>

			<div className="mt-8 space-y-10">
				{groups.map(([groupName, groupEntries]) => (
					<section key={groupName}>
						<h2 className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
							{groupName}
						</h2>

						<div className="mt-4 space-y-6">
							{groupEntries.map((entry) => {
								const draft = drafts[entry.key];
								const value = draft ?? toEditable(entry);
								const dirty = draft !== undefined;
								const error = errors[entry.key];

								return (
									<div key={entry.key} className="rounded-lg border p-4">
										<div className="flex items-start justify-between gap-4">
											<div className="min-w-0">
												<Label
													htmlFor={entry.key}
													className="text-sm font-medium"
												>
													{entry.label || entry.key}
												</Label>
												{entry.description && (
													<p className="text-muted-foreground mt-1 text-xs">
														{entry.description}
													</p>
												)}
												<p className="text-muted-foreground/70 mt-1 font-mono text-[11px]">
													{entry.key}
												</p>
											</div>

											<div className="flex shrink-0 items-center gap-2">
												{entry.published ? (
													<Eye className="text-muted-foreground size-4" />
												) : (
													<EyeSlash className="text-muted-foreground size-4" />
												)}
												<Switch
													checked={entry.published}
													aria-label={
														entry.published
															? "Published. Turn off to hide from your site."
															: "Draft. Turn on to publish."
													}
													disabled={setPublished.isPending}
													onCheckedChange={(next) =>
														setPublished.mutate({
															key: entry.key,
															published: next,
														})
													}
												/>
											</div>
										</div>

										<div className="mt-3">
											{entry.type === "boolean" ? (
												<Switch
													checked={value === "true"}
													onCheckedChange={(next) =>
														setDrafts((current) => ({
															...current,
															[entry.key]: String(next),
														}))
													}
												/>
											) : wantsTextarea(entry) ? (
												<Textarea
													id={entry.key}
													value={value}
													rows={isStructured(entry) ? 10 : 4}
													className={
														isStructured(entry)
															? "font-mono text-xs"
															: undefined
													}
													onChange={(event) =>
														setDrafts((current) => ({
															...current,
															[entry.key]: event.target.value,
														}))
													}
												/>
											) : (
												<Input
													id={entry.key}
													type={entry.type === "number" ? "number" : "text"}
													value={value}
													onChange={(event) =>
														setDrafts((current) => ({
															...current,
															[entry.key]: event.target.value,
														}))
													}
												/>
											)}
										</div>

										{isStructured(entry) && (
											<p className="text-muted-foreground mt-2 text-xs">
												Edited as JSON. A proper editor needs the developer to
												declare each field, which the manifest does not carry
												yet.
											</p>
										)}

										{error && (
											<p className="text-destructive mt-2 text-xs">{error}</p>
										)}

										<div className="mt-3 flex items-center gap-3">
											<Button
												size="sm"
												disabled={!dirty || save.isPending}
												onClick={() => {
													setErrors((current) => {
														const next = { ...current };
														delete next[entry.key];
														return next;
													});
													try {
														save.mutate({
															entry,
															value: fromEditable(entry, value),
														});
													} catch {
														setErrors((current) => ({
															...current,
															[entry.key]:
																"That is not valid JSON, so it was not saved.",
														}));
													}
												}}
											>
												{save.isPending ? "Saving…" : "Save"}
											</Button>

											{dirty && (
												<Button
													size="sm"
													variant="ghost"
													onClick={() =>
														setDrafts((current) => {
															const next = { ...current };
															delete next[entry.key];
															return next;
														})
													}
												>
													Discard
												</Button>
											)}

											{saved[entry.key] && (
												<span className="text-muted-foreground flex items-center gap-1 text-xs">
													<CheckCircle className="size-3.5" />
													Saved
												</span>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</main>
	);
}
