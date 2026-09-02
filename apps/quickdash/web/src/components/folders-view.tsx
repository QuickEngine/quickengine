import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Text as TextField } from "./product-fields";

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

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const _field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

export function FoldersView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
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
			setCreating(false);
			setName("");
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "Add folder",
		onClick: () => setCreating((open) => !open),
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
			{creating ? (
				<CreatePanel
					title="New folder"
					submitLabel="Add folder"
					busy={create.isPending}
					valid={name.trim().length > 0}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Name"
						value={name}
						onChange={setName}
						placeholder="Signed contracts"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				filter={statusFilter.chips("Depth", ["top level", "nested"])}
				filterCount={statusFilter.count}
				exportRows={() => folders.data?.items ?? []}
				exportName="folders"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search folders"
			/>

			{failure ? <WriteFailure message={failure} /> : null}

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
						(folder) =>
							statusFilter.keep(folder.parentId ? "nested" : "top level") &&
							(!needle || folder.name.toLowerCase().includes(needle)),
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
						<PagedTable
							workspaceId={workspaceId}
							layout={layout}
							caption="Folders"
							rows={rows}
							columns={[
								{
									key: "name",
									header: "Folder",
									render: (folder) => folder.name,
								},
								{
									key: "created",
									header: "Created",
									width: "w-24",
									align: "right",
									tight: true,
									render: (folder) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(folder.createdAt).toLocaleDateString()}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (folder) => (
										<button
											type="button"
											className={quiet}
											disabled={remove.isPending}
											onClick={() => remove.mutate(folder.id)}
										>
											Remove
										</button>
									),
								},
							]}
						/>
					);
				}}
			</PageState>
		</main>
	);
}
