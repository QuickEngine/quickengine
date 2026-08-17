import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

/**
 * Content — the words on a business's own website.
 *
 * 🔴 Named slots, NOT pages. A developer declares which parts of a site are
 * editable; the operator fills them in. That boundary is the whole design: the
 * owner can rewrite every word and cannot break the layout, because layout was
 * never theirs to touch. See `internal/planning/CONTENT_MODULE.md`.
 *
 * 🔴 Published is what a site actually serves. A draft is something the business
 * has deliberately not said yet, so it is edited here and stays invisible until
 * somebody publishes it — a half-written About section must never appear
 * mid-sentence on a live page.
 *
 * ⚠️ A `list` slot holds an ordered array — FAQ entries, testimonials. Until the
 * manifest can declare the fields of a list item, those are edited as JSON. That
 * is honest rather than pretty, and it is recorded as the next backend change.
 */

type ContentEntry = {
	key: string;
	type: string;
	kind: "single" | "list";
	value: unknown;
	published: boolean;
	label: string | null;
	description: string | null;
	group: string | null;
};

const solid =
	"inline-flex h-7 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink))] px-2.5 text-[11px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/** What a slot holds, as text somebody can edit. */
const asText = (entry: ContentEntry) => {
	if (entry.kind === "list" || entry.type === "json") {
		return JSON.stringify(entry.value ?? [], null, 2);
	}
	return typeof entry.value === "string"
		? entry.value
		: String(entry.value ?? "");
};

/** A one-line preview, so a long page of slots stays scannable. */
const preview = (entry: ContentEntry) => {
	if (entry.kind === "list") {
		const count = Array.isArray(entry.value) ? entry.value.length : 0;
		return `${count} ${count === 1 ? "entry" : "entries"}`;
	}
	const text = asText(entry).replace(/\s+/g, " ").trim();
	return text.length > 90 ? `${text.slice(0, 90)}…` : text || "Empty";
};

export function ContentView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [draftsOnly, setDraftsOnly] = useState(false);
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const content = useQuery({
		queryKey: ["quickdash", workspaceId, "content"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: ContentEntry[] }>(
					"/content/manage/all",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "content"],
		});

	const save = useMutation({
		mutationFn: async (input: { entry: ContentEntry; text: string }) => {
			const { entry, text } = input;
			// A list or json slot round-trips through JSON; anything else is the
			// string as typed. Parsing failure is reported rather than silently
			// storing the raw text, which would corrupt the shape the site reads.
			let value: unknown = text;
			if (entry.kind === "list" || entry.type === "json") {
				value = JSON.parse(text);
			}
			await workspaceApi(workspaceId).request(
				`/content/manage/${encodeURIComponent(entry.key)}`,
				{
					method: "PUT",
					body: {
						type: entry.type,
						kind: entry.kind,
						value,
						published: entry.published,
						label: entry.label,
						description: entry.description,
						group: entry.group,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(
				error instanceof SyntaxError
					? "That is not valid JSON, so it was not saved."
					: (error?.message ?? "That did not save."),
			),
		onSuccess: () => {
			setEditing(null);
			refresh();
		},
	});

	const setPublished = useMutation({
		mutationFn: async (input: { keys: string[]; published: boolean }) => {
			await workspaceApi(workspaceId).request("/content/manage/publish", {
				method: "POST",
				body: input,
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: refresh,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search content by name or words"
				filterCount={draftsOnly ? 1 : 0}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Show</p>
						<FilterChip
							label="Not published"
							active={draftsOnly}
							onToggle={() => setDraftsOnly(!draftsOnly)}
						/>
					</>
				}
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={content}
				loadingLabel="Loading content…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing to edit yet"
						detail="Your website declares which parts are editable. Once it does, every piece of text appears here for you to change."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((entry) => (draftsOnly ? !entry.published : true))
						.filter(
							(entry) =>
								!needle ||
								entry.key.toLowerCase().includes(needle) ||
								(entry.label ?? "").toLowerCase().includes(needle) ||
								asText(entry).toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the filter."
							/>
						);
					}

					// Grouped the way the site's developer grouped them; anything
					// ungrouped falls to the end rather than being hidden.
					const groups = [
						...new Set(rows.map((entry) => entry.group ?? "Other")),
					];

					return (
						<div className="space-y-6">
							{groups.map((group) => (
								<section key={group}>
									<p className="mb-1 text-[11px] text-[var(--ink-45)]">
										{group}
									</p>
									<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
										{rows
											.filter((entry) => (entry.group ?? "Other") === group)
											.map((entry) => {
												const open = editing === entry.key;
												return (
													<div key={entry.key} className="py-2.5">
														<div className="flex items-center gap-3">
															<div className="min-w-0 flex-1">
																<p className="truncate text-[12.5px] text-[var(--ink-85)]">
																	{entry.label ?? entry.key}
																</p>
																<p className="truncate text-[11px] text-[var(--ink-30)]">
																	{preview(entry)}
																</p>
															</div>

															{!entry.published ? (
																<span className="shrink-0 rounded-full bg-[rgb(var(--console-ink)/0.08)] px-2 py-0.5 text-[10.5px] text-[#f5b44a]">
																	Not published
																</span>
															) : null}

															<button
																type="button"
																className={quiet}
																onClick={() => {
																	setEditing(open ? null : entry.key);
																	setDraft(asText(entry));
																	setFailure(null);
																}}
															>
																{open ? "Cancel" : "Edit"}
															</button>
															<button
																type="button"
																className={quiet}
																disabled={rowBusy(setPublished, entry.key)}
																onClick={() =>
																	setPublished.mutate({
																		keys: [entry.key],
																		published: !entry.published,
																	})
																}
															>
																{entry.published ? "Unpublish" : "Publish"}
															</button>
														</div>

														{open ? (
															<div className="mt-2">
																<textarea
																	value={draft}
																	onChange={(event) =>
																		setDraft(event.target.value)
																	}
																	rows={entry.kind === "list" ? 12 : 5}
																	className={`w-full resize-y rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 py-2 text-[12.5px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)] ${
																		entry.kind === "list" ||
																		entry.type === "json"
																			? "font-mono text-[11.5px]"
																			: ""
																	}`}
																/>
																<div className="mt-2 flex items-center gap-2">
																	<button
																		type="button"
																		className={`${solid} ${save.isPending ? "shimmer-busy" : ""}`}
																		disabled={save.isPending}
																		onClick={() =>
																			save.mutate({ entry, text: draft })
																		}
																	>
																		{save.isPending ? "Saving…" : "Save"}
																	</button>
																	<p className="text-[11px] text-[var(--ink-30)]">
																		{entry.published
																			? "This is live on your site."
																			: "Saved as a draft until you publish it."}
																	</p>
																</div>
															</div>
														) : null}
													</div>
												);
											})}
									</div>
								</section>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
