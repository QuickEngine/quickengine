import {
	getFileDocument,
	listFileDocuments,
	listFileFolders,
} from "@quickengine/mod-files";
import { FilesView } from "../_components/files-view";
import type { ModulePageProps } from "./types";

export default async function FilesPage({ workspaceId }: ModulePageProps) {
	const folders = await listFileFolders(workspaceId);
	const fileRows = await listFileDocuments(workspaceId, {
		includeArchived: true,
		includeTrashed: true,
	});
	const fileDetails = await Promise.all(
		fileRows.map((document) => getFileDocument(workspaceId, document.id)),
	);
	return (
		<FilesView
			workspaceId={workspaceId}
			folders={folders.map((folder) => ({
				id: folder.id,
				name: folder.name,
				parentId: folder.parentId,
			}))}
			documents={fileDetails.flatMap((document) => {
				if (!document) return [];
				const version = document.versions.find(
					(candidate) =>
						candidate.versionNumber === document.currentVersionNumber,
				);
				return [
					{
						id: document.id,
						title: document.title,
						description: document.description,
						folderId: document.folderId,
						status: document.status as "active" | "archived" | "trashed",
						tags: document.tags,
						version: version?.versionNumber ?? null,
						fileName: version?.originalName ?? null,
						category: version?.category ?? null,
						sizeBytes: version?.sizeBytes ?? null,
					},
				];
			})}
		/>
	);
}
