import { createLocalStorageProvider } from "@quickengine/storage";
import { describe, expect, it } from "vitest";
import {
	fileAttachmentInputSchema,
	resolveAttachmentVersionId,
} from "./attachment";
import {
	canTransitionDocument,
	canTransitionFileVersion,
	classifyFileContentType,
	documentInputSchema,
	fileVersionInputSchema,
	MAX_FILE_SIZE_BYTES,
} from "./document";
import { folderInputSchema } from "./folder";
import { filesModule, filesSettingsSchema } from "./module";

const documentId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-000000000003";

describe("files and documents module", () => {
	it("is the canonical shared files module and meters only stored bytes", () => {
		expect(filesModule).toMatchObject({
			id: "files",
			kind: "shared",
			dependsOn: [],
			meteredAction: "storageBytes",
		});
	});

	it("stores private locators with provider-attested bytes and checksums", async () => {
		const provider = createLocalStorageProvider("http://localhost:3001");
		const stored = await provider.put({
			bucket: "documents",
			key: "workspace/document/version",
			body: "hello",
			contentType: "text/plain",
		});
		expect(stored).toMatchObject({
			provider: "local",
			bucket: "documents",
			key: "workspace/document/version",
			size: 5,
			checksumSha256:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
		expect(stored).not.toHaveProperty("url");
		const access = await provider.createDownloadAccess(stored);
		expect(access.url).toBe(
			"http://localhost:3001/storage/documents/workspace/document/version",
		);
		expect(access.expiresAt).toBeInstanceOf(Date);
	});

	it("pins attachments by default so history cannot silently change", () => {
		expect(filesSettingsSchema.parse({})).toEqual({
			defaultAttachmentMode: "pinned",
		});
		expect(resolveAttachmentVersionId("pinned", versionId)).toBe(versionId);
		expect(resolveAttachmentVersionId("latest", versionId)).toBeNull();
		expect(resolveAttachmentVersionId("latest", versionId, documentId)).toBe(
			documentId,
		);
	});
});

describe("immutable stored versions", () => {
	it("normalizes trustworthy upload metadata", () => {
		expect(
			fileVersionInputSchema.parse({
				originalName: " Client Contract.pdf ",
				contentType: " APPLICATION/PDF ",
				sizeBytes: 48_000,
				checksumSha256: "A".repeat(64),
			}),
		).toMatchObject({
			originalName: "Client Contract.pdf",
			contentType: "application/pdf",
			checksumSha256: "a".repeat(64),
		});
	});

	it("rejects paths, invalid metadata, empty files, and oversized objects", () => {
		const valid = {
			originalName: "contract.pdf",
			contentType: "application/pdf",
			sizeBytes: 100,
			checksumSha256: "a".repeat(64),
		};
		expect(() =>
			fileVersionInputSchema.parse({ ...valid, originalName: "../secret.pdf" }),
		).toThrow();
		expect(() =>
			fileVersionInputSchema.parse({ ...valid, contentType: "not-a-mime" }),
		).toThrow();
		expect(() =>
			fileVersionInputSchema.parse({ ...valid, sizeBytes: 0 }),
		).toThrow();
		expect(() =>
			fileVersionInputSchema.parse({
				...valid,
				sizeBytes: MAX_FILE_SIZE_BYTES + 1,
			}),
		).toThrow();
		expect(() =>
			fileVersionInputSchema.parse({ ...valid, checksumSha256: "abc" }),
		).toThrow();
	});

	it("classifies common business file types without trusting extensions", () => {
		expect(classifyFileContentType("application/pdf")).toBe("pdf");
		expect(classifyFileContentType("image/png")).toBe("image");
		expect(classifyFileContentType("text/csv")).toBe("spreadsheet");
		expect(classifyFileContentType("application/octet-stream")).toBe("other");
	});

	it("keeps available versions immutable while allowing upload recovery", () => {
		expect(canTransitionFileVersion("pending", "available")).toBe(true);
		expect(canTransitionFileVersion("pending", "quarantined")).toBe(true);
		expect(canTransitionFileVersion("failed", "pending")).toBe(true);
		expect(canTransitionFileVersion("quarantined", "available")).toBe(true);
		expect(canTransitionFileVersion("available", "pending")).toBe(false);
	});
});

describe("organization and cross-module attachments", () => {
	it("normalizes tags and supports an optional folder", () => {
		expect(
			documentInputSchema.parse({
				title: " Brand Assets ",
				folderId: documentId,
				tags: [" Logo ", "logo", "Current"],
			}),
		).toMatchObject({
			title: "Brand Assets",
			folderId: documentId,
			tags: ["logo", "current"],
		});
	});

	it("supports nested folders but rejects path-like names", () => {
		expect(
			folderInputSchema.parse({ name: "Contracts", parentId: documentId }),
		).toMatchObject({ name: "Contracts", parentId: documentId });
		expect(() =>
			folderInputSchema.parse({ name: "clients/contracts" }),
		).toThrow();
	});

	it("uses canonical module and record identities for generic attachments", () => {
		expect(
			fileAttachmentInputSchema.parse({
				documentId,
				versionId,
				targetModuleId: " Projects-Tasks ",
				targetRecordType: " Project ",
				targetRecordId: targetId,
				role: "deliverable",
			}),
		).toMatchObject({
			targetModuleId: "projects-tasks",
			targetRecordType: "project",
			role: "deliverable",
		});
		expect(() =>
			fileAttachmentInputSchema.parse({
				documentId,
				targetModuleId: "projects/tasks",
				targetRecordType: "project",
				targetRecordId: targetId,
			}),
		).toThrow();
	});

	it("archives, trashes, and restores documents without erasing versions", () => {
		expect(canTransitionDocument("active", "archived")).toBe(true);
		expect(canTransitionDocument("archived", "active")).toBe(true);
		expect(canTransitionDocument("active", "trashed")).toBe(true);
		expect(canTransitionDocument("trashed", "active")).toBe(true);
		expect(canTransitionDocument("trashed", "deleting")).toBe(true);
		expect(canTransitionDocument("trashed", "archived")).toBe(false);
		expect(canTransitionDocument("deleting", "active")).toBe(false);
	});
});
