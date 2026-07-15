"use client";
import {
	Archive,
	DownloadSimple,
	File,
	Folder,
	Trash,
} from "@phosphor-icons/react";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { useActionState } from "react";
import {
	createFolderAction,
	downloadFileAction,
	type FileActionState,
	fileStatusAction,
	uploadFileAction,
} from "../_lib/file-actions";

const INITIAL: FileActionState = { error: null, completionId: null };
type Action = (
	state: FileActionState,
	data: FormData,
) => Promise<FileActionState>;
type FolderRow = { id: string; name: string; parentId: string | null };
type DocumentRow = {
	id: string;
	title: string;
	description: string | null;
	folderId: string | null;
	status: "active" | "archived" | "trashed";
	tags: string[];
	version: number | null;
	fileName: string | null;
	category: string | null;
	sizeBytes: number | null;
};
function Form({
	action,
	hidden,
	children,
}: {
	action: Action;
	hidden: Record<string, string>;
	children: React.ReactNode;
}) {
	const [state, formAction] = useActionState(action, INITIAL);
	return (
		<form action={formAction} className="flex flex-wrap items-center gap-2">
			{Object.entries(hidden).map(([name, value]) => (
				<input key={name} type="hidden" name={name} value={value} />
			))}
			{children}
			{state.error && (
				<span className="text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}
export function FilesView({
	workspaceId,
	folders,
	documents,
}: {
	workspaceId: string;
	folders: FolderRow[];
	documents: DocumentRow[];
}) {
	return (
		<section className="mt-8 space-y-6">
			<div>
				<h2 className="font-medium text-lg">File desk</h2>
				<p className="text-muted-foreground text-sm">
					Private, versioned workspace documents with temporary authorized
					downloads.
				</p>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<div className="rounded-xl border p-4">
					<h3 className="mb-3 font-medium">New folder</h3>
					<Form action={createFolderAction} hidden={{ workspaceId }}>
						<Input name="name" placeholder="Folder name" required />
						<NativeSelect name="parentId">
							<option value="">Root</option>
							{folders.map((folder) => (
								<option key={folder.id} value={folder.id}>
									{folder.name}
								</option>
							))}
						</NativeSelect>
						<Button type="submit">
							<Folder /> Create
						</Button>
					</Form>
				</div>
				<div className="rounded-xl border p-4">
					<h3 className="mb-3 font-medium">Upload document</h3>
					<Form action={uploadFileAction} hidden={{ workspaceId }}>
						<Input name="file" type="file" required />
						<Input name="title" placeholder="Document title (optional)" />
						<NativeSelect name="folderId">
							<option value="">Root</option>
							{folders.map((folder) => (
								<option key={folder.id} value={folder.id}>
									{folder.name}
								</option>
							))}
						</NativeSelect>
						<Input name="tags" placeholder="tags, comma-separated" />
						<Textarea name="description" placeholder="Description" />
						<Button type="submit">Upload</Button>
					</Form>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				{folders.map((folder) => (
					<Badge key={folder.id} variant="outline">
						<Folder />
						{folder.name}
					</Badge>
				))}
			</div>
			<div className="space-y-2">
				{documents.length === 0 ? (
					<div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
						<File className="mx-auto" />
						No documents yet.
					</div>
				) : (
					documents.map((document) => (
						<article
							key={document.id}
							className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
						>
							<div>
								<div className="flex gap-2">
									<strong>{document.title}</strong>
									<Badge variant="secondary">{document.status}</Badge>
									{document.category && (
										<Badge variant="outline">{document.category}</Badge>
									)}
								</div>
								<p className="text-muted-foreground text-sm">
									{document.fileName ?? "No available version"}
									{document.sizeBytes !== null
										? ` · ${(document.sizeBytes / 1024).toFixed(1)} KB`
										: ""}
									{document.version ? ` · v${document.version}` : ""}
								</p>
								{document.description && (
									<p className="text-sm">{document.description}</p>
								)}
							</div>
							<div className="flex gap-2">
								{document.version && (
									<form action={downloadFileAction}>
										<input
											type="hidden"
											name="workspaceId"
											value={workspaceId}
										/>
										<input
											type="hidden"
											name="documentId"
											value={document.id}
										/>
										<Button type="submit" variant="outline">
											<DownloadSimple /> Download
										</Button>
									</form>
								)}
								{document.status === "active" && (
									<Form
										action={fileStatusAction}
										hidden={{
											workspaceId,
											documentId: document.id,
											target: "archived",
										}}
									>
										<Button type="submit">
											<Archive /> Archive
										</Button>
									</Form>
								)}
								{document.status === "archived" && (
									<Form
										action={fileStatusAction}
										hidden={{
											workspaceId,
											documentId: document.id,
											target: "active",
										}}
									>
										<Button type="submit">Restore</Button>
									</Form>
								)}
								{document.status !== "trashed" && (
									<Form
										action={fileStatusAction}
										hidden={{
											workspaceId,
											documentId: document.id,
											target: "trashed",
										}}
									>
										<Button type="submit" variant="destructive">
											<Trash /> Trash
										</Button>
									</Form>
								)}
								{document.status === "trashed" && (
									<Form
										action={fileStatusAction}
										hidden={{
											workspaceId,
											documentId: document.id,
											target: "active",
										}}
									>
										<Button type="submit">Restore</Button>
									</Form>
								)}
							</div>
						</article>
					))
				)}
			</div>
		</section>
	);
}
