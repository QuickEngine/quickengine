import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { DocumentPanel } from "./module-panels";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";

/**
 * Files — documents a business keeps, not pictures it publishes.
 *
 * 🔴 These are PRIVATE. Storage hands back short-lived signed URLs after
 * authorization, never a durable link, because this is where a signed contract
 * or an identity document lives. Product photographs go somewhere else
 * entirely, on purpose.
 *
 * ⚠️ Trashing is reversible and deleting is not, so they are separate actions
 * and only trashing is one click.
 */

const STATUSES = ["active", "archived", "trashed"] as const;

type Document = {
	id: string;
	title: string;
	status: string;
	folderId: string | null;
	description: string | null;
	currentVersionNumber: number | null;
	updatedAt: string;
};

type Folder = { id: string; name: string };

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

export function FilesView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	const fileInput = useRef<HTMLInputElement>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const files = useQuery({
		queryKey: ["quickdash", workspaceId, "documents"],
		queryFn: async () => {
			const api = workspaceApi(workspaceId);
			const [documents, folders] = await Promise.all([
				api.request<{ items: Document[] }>("/documents?limit=100"),
				api.request<{ items: Folder[] }>("/file-folders"),
			]);
			return {
				items: documents.data.items,
				folders: new Map(
					folders.data.items.map((folder) => [folder.id, folder.name]),
				),
			};
		},
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "documents"],
		});

	const upload = useMutation({
		mutationFn: async (chosen: FileList) => {
			// Sequential: each upload is its own document and the list is refetched
			// once at the end rather than racing a refresh per file.
			for (const file of Array.from(chosen)) {
				const form = new FormData();
				form.set("file", file);
				form.set("title", file.name);
				await workspaceApi(workspaceId).request("/quickdash/files/upload", {
					method: "POST",
					body: form,
					idempotencyKey: crypto.randomUUID(),
				});
			}
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That upload did not work."),
		onSuccess: refresh,
	});

	const setStatus = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await workspaceApi(workspaceId).request(`/documents/${input.id}/status`, {
				method: "POST",
				body: { status: input.status },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: refresh,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-4 flex items-center gap-2">
				<button
					type="button"
					className={`${pill} ${upload.isPending ? "shimmer-busy" : ""}`}
					disabled={upload.isPending}
					onClick={() => fileInput.current?.click()}
				>
					{upload.isPending ? "Uploading…" : "Upload files"}
				</button>
				<p className="text-[11px] text-[var(--ink-30)]">
					Kept private. Shared only through a link that expires.
				</p>
				<input
					ref={fileInput}
					type="file"
					multiple
					hidden
					onChange={(event) => {
						if (event.target.files?.length) upload.mutate(event.target.files);
						event.target.value = "";
					}}
				/>
			</div>

			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search files by name"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => (
								<FilterChip
									key={status}
									label={status}
									active={statuses.includes(status)}
									onToggle={() =>
										setStatuses(
											statuses.includes(status)
												? statuses.filter((value) => value !== status)
												: [...statuses, status],
										)
									}
								/>
							))}
						</div>
					</>
				}
			/>

			{failure ? <WriteFailure message={failure} /> : null}

			<PageState
				query={files}
				loadingLabel="Loading files…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No files"
						detail="Contracts, receipts and anything else worth keeping. Files here are private and are never served publicly."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((document) =>
							statuses.length === 0
								? document.status !== "trashed"
								: statuses.includes(document.status),
						)
						.filter(
							(document) =>
								!needle || document.title.toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					return (
						<PagedTable
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Documents"
							rows={rows}
							selectedId={selectedId}
							onOpen={(document) => setSelectedId(document.id)}
							columns={[
								{
									key: "title",
									header: "Document",
									render: (document) => document.title,
								},
								{
									key: "folder",
									header: "Folder",
									width: "w-48",
									render: (document) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{document.folderId
												? (data.folders.get(document.folderId) ?? "Folder")
												: "No folder"}
										</span>
									),
								},
								{
									key: "version",
									header: "Version",
									width: "w-20",
									align: "right",
									tight: true,
									render: (document) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{document.currentVersionNumber ?? ""}
										</span>
									),
								},
								{
									key: "status",
									header: "Status",
									width: "w-20",
									tight: true,
									render: (document) => (
										<span className="text-[11px] text-[var(--ink-30)] capitalize">
											{document.status}
										</span>
									),
								},
								{
									key: "updated",
									header: "Updated",
									width: "w-24",
									align: "right",
									tight: true,
									render: (document) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(document.updatedAt).toLocaleDateString()}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (document) =>
										document.status === "trashed" ? (
											<button
												type="button"
												className={quiet}
												disabled={rowBusy(setStatus, document.id)}
												onClick={() =>
													setStatus.mutate({
														id: document.id,
														status: "active",
													})
												}
											>
												Restore
											</button>
										) : (
											<button
												type="button"
												className={quiet}
												disabled={rowBusy(setStatus, document.id)}
												onClick={() =>
													setStatus.mutate({
														id: document.id,
														status: "trashed",
													})
												}
											>
												Trash
											</button>
										),
								},
							]}
						/>
					);
				}}
			</PageState>
			{selectedId ? (
				<DocumentPanel
					workspaceId={workspaceId}
					id={selectedId}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
