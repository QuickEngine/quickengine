import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

/**
 * Folders — where files are filed.
 *
 * ⚠️ Deleting a folder does not delete what is inside it. The files survive and
 * become unfiled, which is the safe direction: somebody tidying up their
 * structure must never lose a contract by dragging the wrong thing.
 */

type Folder = {
	id: string;
	name: string;
	parentId: string | null;
	createdAt: string;
};

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

export function FoldersView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const folders = useQuery({
		queryKey: ["quickdash", workspaceId, "file-folders"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Folder[] }>(
					"/file-folders",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "file-folders"],
		});

	const create = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request("/file-folders", {
				method: "POST",
				body: { name: name.trim() },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That folder could not be created."),
		onSuccess: () => {
			setName("");
			refresh();
		},
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).request(`/file-folders/${id}`, {
				method: "DELETE",
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That folder could not be removed."),
		onSuccess: refresh,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<form
				className="mb-4 flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim()) create.mutate();
				}}
			>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="New folder name"
					className={`${field} w-64`}
				/>
				<button
					type="submit"
					className={pill}
					disabled={create.isPending || !name.trim()}
				>
					{create.isPending ? "Adding…" : "Add folder"}
				</button>
			</form>

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search folders"
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={folders}
				loadingLabel="Loading folders…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No folders"
						detail="Folders are optional. Files work fine without them, and can be filed later."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(folder) => !needle || folder.name.toLowerCase().includes(needle),
					);
					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						);
					}
					return (
						<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
							{rows.map((folder) => (
								<div key={folder.id} className="flex items-center gap-3 py-2.5">
									<span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
										{folder.name}
									</span>
									<span className="w-24 shrink-0 text-right text-[10.5px] text-[var(--ink-30)]">
										{new Date(folder.createdAt).toLocaleDateString()}
									</span>
									<button
										type="button"
										className={quiet}
										disabled={remove.isPending}
										onClick={() => remove.mutate(folder.id)}
									>
										Remove
									</button>
								</div>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
