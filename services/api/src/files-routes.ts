import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import { getJobQueue } from "@quickengine/jobs";
import {
	createFileFolderCommand,
	DOCUMENT_STATUSES,
	deleteFileFolderCommand,
	getFileDocumentDto,
	listFileAttachmentsPage,
	listFileDocumentsPage,
	listFileFoldersPage,
	releaseQuarantinedFileVersionCommand,
	removeFileAttachmentCommand,
	requestFileDocumentDeletionCommand,
	setFileDocumentStatusCommand,
	updateFileDocumentCommand,
	updateFileFolderCommand,
} from "@quickengine/mod-files";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

const uuid = z.uuid();
const visibleStatusSchema = z.object({
	status: z.enum(
		DOCUMENT_STATUSES.filter(
			(
				status,
			): status is Exclude<(typeof DOCUMENT_STATUSES)[number], "deleting"> =>
				status !== "deleting",
		),
	),
});

/**
 * Files HTTP surface.
 *
 * Deliberately **no upload route here.** Uploading is a saga — reserve a version row, put the bytes
 * in storage, then record the outcome — and the byte transfer must not stream through this service
 * inside a database transaction. The upload path is exposed as reserve/finalize (signed, direct to
 * storage) in its own slice; QuickDash meanwhile uses the module's server-side composite. Every
 * route below is pure database work and safe to run inside a unit of work.
 */
export function registerFilesRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "files:read",
		module: "files",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "files:write",
		module: "files",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "files.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "files.write",
	});

	const mutationContext = async (
		c: Context<PlatformEnv>,
		operation: string,
		canonicalInput: unknown,
	) =>
		buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput,
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation,
			requestId: c.get("requestId"),
		});

	/* Folders */

	app.get("/v1/file-folders", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listFileFoldersPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				limit: c.req.query("limit"),
				parentId: c.req.query("parentId"),
				rootOnly: c.req.query("rootOnly"),
			}),
		),
	);
	app.post("/v1/file-folders", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "files.folder.create", body);
		return respondMutation(
			c,
			await createFileFolderCommand(context, body, options.uow),
		);
	});
	app.patch("/v1/file-folders/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "files.folder.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateFileFolderCommand(context, id, body, options.uow),
		);
	});
	app.delete("/v1/file-folders/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "files.folder.delete", { id });
		return respondMutation(
			c,
			await deleteFileFolderCommand(context, id, options.uow),
		);
	});

	/* Documents */

	app.get("/v1/documents", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listFileDocumentsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				folderId: c.req.query("folderId"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.get("/v1/documents/:id", readAccess, readLimit, async (c) => {
		// Storage addressing is stripped from every version by the module's serializer.
		const document = await getFileDocumentDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return document
			? respond(c, document)
			: respondError(c, "NOT_FOUND", "The document was not found.", 404);
	});
	app.patch("/v1/documents/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "files.document.update", {
			body,
			id,
		});
		return respondMutation(
			c,
			await updateFileDocumentCommand(context, id, body, options.uow),
		);
	});
	/** Archive, trash, or restore a document. Permanent deletion has its own durable route. */
	app.post("/v1/documents/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = visibleStatusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "files.document.status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setFileDocumentStatusCommand(context, id, status, options.uow),
		);
	});
	app.delete("/v1/documents/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "files.document.delete", { id });
		return respondMutation(
			c,
			await requestFileDocumentDeletionCommand(
				context,
				id,
				getJobQueue(),
				options.uow,
			),
		);
	});
	app.get("/v1/documents/:id/attachments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listFileAttachmentsPage(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
			),
		),
	);

	/* Versions and attachments */

	app.post(
		"/v1/file-versions/:id/release",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const context = await mutationContext(c, "files.version.release", { id });
			return respondMutation(
				c,
				await releaseQuarantinedFileVersionCommand(context, id, options.uow),
			);
		},
	);
	app.delete("/v1/file-attachments/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "files.attachment.remove", { id });
		return respondMutation(
			c,
			await removeFileAttachmentCommand(context, id, options.uow),
		);
	});
}
