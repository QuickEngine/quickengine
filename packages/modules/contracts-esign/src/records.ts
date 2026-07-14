import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
	and,
	asc,
	clientRecords,
	contractAuditEvents,
	contractSequences,
	contractSigners,
	contracts,
	db,
	desc,
	eq,
	fileDocuments,
	fileVersions,
	quickengineWorkspaces,
	sql,
} from "@quickengine/db";
import { z } from "zod";
import {
	type ContractInput,
	contractInputSchema,
	formatContractNumber,
	type SignatureEvidenceInput,
	signatureEvidenceInputSchema,
} from "./contract";
import {
	contractNumberPrefixSchema,
	contractsEsignSettingsSchema,
} from "./module";
import {
	type ContractStatus,
	canSupersedeContract,
	contractStatusFromSigners,
} from "./status";

type ContractTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryExecutor = Pick<typeof db, "select">;

const sendContractOptionsSchema = z.object({
	consentText: z.string().trim().min(1).max(10_000).optional(),
	consentVersion: z.string().trim().min(1).max(50).default("1"),
	expiresAt: z.date().optional(),
	now: z.date().optional(),
	actorId: z.string().trim().min(1).max(255).nullable().default(null),
});

function tokenHash(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function invitationToken(): string {
	return randomBytes(32).toString("base64url");
}

async function addAuditEvent(
	tx: ContractTransaction,
	input: {
		workspaceId: string;
		contractId: string;
		signerId?: string | null;
		eventType: string;
		actorType: "workspace_user" | "signer" | "system";
		actorId?: string | null;
		details?: Record<string, unknown>;
	},
) {
	await tx.insert(contractAuditEvents).values({
		...input,
		signerId: input.signerId ?? null,
		actorId: input.actorId ?? null,
		details: input.details ?? {},
	});
}

async function resolveReferences(
	executor: QueryExecutor,
	workspaceId: string,
	input: ReturnType<typeof contractInputSchema.parse>,
) {
	const [client] = await executor
		.select({
			workspaceId: clientRecords.workspaceId,
			name: clientRecords.name,
			email: clientRecords.email,
			company: clientRecords.company,
		})
		.from(clientRecords)
		.where(eq(clientRecords.id, input.clientId))
		.limit(1);
	if (!client) throw new Error("CLIENT_NOT_FOUND");
	if (client.workspaceId !== workspaceId)
		throw new Error("CLIENT_WORKSPACE_MISMATCH");

	const [file] = await executor
		.select({
			workspaceId: fileVersions.workspaceId,
			documentId: fileVersions.documentId,
			status: fileVersions.status,
			originalName: fileVersions.originalName,
			contentType: fileVersions.contentType,
			checksumSha256: fileVersions.checksumSha256,
			documentStatus: fileDocuments.status,
		})
		.from(fileVersions)
		.innerJoin(fileDocuments, eq(fileDocuments.id, fileVersions.documentId))
		.where(eq(fileVersions.id, input.fileVersionId))
		.limit(1);
	if (!file) throw new Error("FILE_VERSION_NOT_FOUND");
	if (file.workspaceId !== workspaceId)
		throw new Error("FILE_VERSION_WORKSPACE_MISMATCH");
	if (file.status !== "available")
		throw new Error("FILE_VERSION_NOT_AVAILABLE");
	if (file.documentStatus === "trashed" || file.documentStatus === "deleting") {
		throw new Error("FILE_DOCUMENT_UNAVAILABLE");
	}
	return { client, file };
}

async function replaceSigners(
	tx: ContractTransaction,
	workspaceId: string,
	contractId: string,
	signers: ReturnType<typeof contractInputSchema.parse>["signers"],
) {
	await tx
		.delete(contractSigners)
		.where(eq(contractSigners.contractId, contractId));
	await tx.insert(contractSigners).values(
		signers.map((signer, position) => ({
			workspaceId,
			contractId,
			...signer,
			position,
		})),
	);
}

export type CreateContractInput = ContractInput & { numberPrefix?: string };

export async function createContract(
	workspaceId: string,
	input: CreateContractInput,
) {
	const parsed = contractInputSchema.parse(input);
	const defaults = contractsEsignSettingsSchema.parse({});
	const numberPrefix = contractNumberPrefixSchema.parse(
		input.numberPrefix ?? defaults.contractNumberPrefix,
	);
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1);
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
		const { client, file } = await resolveReferences(tx, workspaceId, parsed);
		const now = new Date();
		const [counter] = await tx
			.insert(contractSequences)
			.values({ workspaceId, lastSequence: 1, updatedAt: now })
			.onConflictDoUpdate({
				target: contractSequences.workspaceId,
				set: {
					lastSequence: sql`${contractSequences.lastSequence} + 1`,
					updatedAt: now,
				},
			})
			.returning({ sequence: contractSequences.lastSequence });
		const id = randomUUID();
		const [created] = await tx
			.insert(contracts)
			.values({
				id,
				workspaceId,
				seriesId: id,
				clientId: parsed.clientId,
				clientName: client.name,
				clientEmail: client.email,
				clientCompany: client.company,
				fileVersionId: parsed.fileVersionId,
				fileDocumentId: file.documentId,
				fileName: file.originalName,
				fileContentType: file.contentType,
				fileChecksumSha256: file.checksumSha256,
				title: parsed.title,
				description: parsed.description,
				numberPrefix,
				sequence: counter.sequence,
				number: formatContractNumber(numberPrefix, counter.sequence),
				effectiveOn: parsed.effectiveOn,
				endsOn: parsed.endsOn,
				metadata: parsed.metadata,
			})
			.returning();
		await replaceSigners(tx, workspaceId, id, parsed.signers);
		await addAuditEvent(tx, {
			workspaceId,
			contractId: id,
			eventType: "contract.created",
			actorType: "workspace_user",
		});
		return created;
	});
}

export async function listContracts(workspaceId: string) {
	return db
		.select()
		.from(contracts)
		.where(eq(contracts.workspaceId, workspaceId))
		.orderBy(desc(contracts.createdAt));
}

export async function getContract(workspaceId: string, id: string) {
	const [contract] = await db
		.select()
		.from(contracts)
		.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
		.limit(1);
	if (!contract) return undefined;
	const [signers, auditEvents] = await Promise.all([
		db
			.select({
				id: contractSigners.id,
				name: contractSigners.name,
				email: contractSigners.email,
				role: contractSigners.role,
				position: contractSigners.position,
				status: contractSigners.status,
				viewedAt: contractSigners.viewedAt,
				signedAt: contractSigners.signedAt,
				declinedAt: contractSigners.declinedAt,
			})
			.from(contractSigners)
			.where(eq(contractSigners.contractId, id))
			.orderBy(asc(contractSigners.position)),
		db
			.select()
			.from(contractAuditEvents)
			.where(eq(contractAuditEvents.contractId, id))
			.orderBy(asc(contractAuditEvents.occurredAt)),
	]);
	return { ...contract, signers, auditEvents };
}

export async function updateDraftContract(
	workspaceId: string,
	id: string,
	input: ContractInput,
) {
	const parsed = contractInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(contracts)
			.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("CONTRACT_NOT_FOUND");
		if (current.status !== "draft") throw new Error("CONTRACT_NOT_EDITABLE");
		const { client, file } = await resolveReferences(tx, workspaceId, parsed);
		const now = new Date();
		const [updated] = await tx
			.update(contracts)
			.set({
				clientId: parsed.clientId,
				clientName: client.name,
				clientEmail: client.email,
				clientCompany: client.company,
				fileVersionId: parsed.fileVersionId,
				fileDocumentId: file.documentId,
				fileName: file.originalName,
				fileContentType: file.contentType,
				fileChecksumSha256: file.checksumSha256,
				title: parsed.title,
				description: parsed.description,
				effectiveOn: parsed.effectiveOn,
				endsOn: parsed.endsOn,
				metadata: parsed.metadata,
				updatedAt: now,
			})
			.where(
				and(
					eq(contracts.id, id),
					eq(contracts.workspaceId, workspaceId),
					eq(contracts.status, "draft"),
				),
			)
			.returning();
		if (!updated) throw new Error("CONTRACT_CONCURRENT_UPDATE");
		await replaceSigners(tx, workspaceId, id, parsed.signers);
		await addAuditEvent(tx, {
			workspaceId,
			contractId: id,
			eventType: "contract.draft_updated",
			actorType: "workspace_user",
		});
		return updated;
	});
}

export async function sendContract(
	workspaceId: string,
	id: string,
	options: z.input<typeof sendContractOptionsSchema> = {},
) {
	const parsed = sendContractOptionsSchema.parse(options);
	const now = parsed.now ?? new Date();
	const defaults = contractsEsignSettingsSchema.parse({});
	const expiresAt =
		parsed.expiresAt ??
		new Date(now.getTime() + defaults.defaultSigningExpiryDays * 86_400_000);
	if (expiresAt <= now) throw new Error("CONTRACT_EXPIRY_INVALID");
	const consentText = parsed.consentText ?? defaults.defaultConsentText;
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(contracts)
			.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("CONTRACT_NOT_FOUND");
		if (current.status !== "draft") throw new Error("CONTRACT_NOT_SENDABLE");
		const signers = await tx
			.select()
			.from(contractSigners)
			.where(eq(contractSigners.contractId, id))
			.orderBy(asc(contractSigners.position))
			.for("update");
		if (signers.length === 0) throw new Error("CONTRACT_REQUIRES_SIGNERS");
		if (current.supersedesId) {
			const [previous] = await tx
				.select()
				.from(contracts)
				.where(
					and(
						eq(contracts.workspaceId, workspaceId),
						eq(contracts.id, current.supersedesId),
					),
				)
				.limit(1)
				.for("update");
			if (
				!previous ||
				previous.seriesId !== current.seriesId ||
				!canSupersedeContract(previous.status)
			)
				throw new Error("CONTRACT_REVISION_SOURCE_INVALID");
			await tx
				.update(contracts)
				.set({ status: "superseded", supersededAt: now, updatedAt: now })
				.where(
					and(
						eq(contracts.id, previous.id),
						eq(contracts.status, previous.status),
					),
				);
			await addAuditEvent(tx, {
				workspaceId,
				contractId: previous.id,
				eventType: "contract.superseded",
				actorType: "workspace_user",
				actorId: parsed.actorId,
				details: { replacementContractId: id },
			});
		}
		const invitations = signers.map((signer) => ({
			signer,
			token: invitationToken(),
		}));
		for (const invitation of invitations) {
			await tx
				.update(contractSigners)
				.set({
					tokenHash: tokenHash(invitation.token),
					tokenExpiresAt: expiresAt,
					updatedAt: now,
				})
				.where(eq(contractSigners.id, invitation.signer.id));
		}
		const [sent] = await tx
			.update(contracts)
			.set({
				status: "sent",
				consentText,
				consentVersion: parsed.consentVersion,
				signingExpiresAt: expiresAt,
				sentAt: now,
				updatedAt: now,
			})
			.where(and(eq(contracts.id, id), eq(contracts.status, "draft")))
			.returning();
		if (!sent) throw new Error("CONTRACT_CONCURRENT_UPDATE");
		await addAuditEvent(tx, {
			workspaceId,
			contractId: id,
			eventType: "contract.sent",
			actorType: "workspace_user",
			actorId: parsed.actorId,
			details: {
				signerCount: signers.length,
				expiresAt: expiresAt.toISOString(),
			},
		});
		return {
			contract: sent,
			invitations: invitations.map(({ signer, token }) => ({
				signerId: signer.id,
				name: signer.name,
				email: signer.email,
				token,
				expiresAt,
			})),
		};
	});
}

async function resolveSignerToken(tx: ContractTransaction, rawToken: string) {
	if (rawToken.length < 32 || rawToken.length > 256)
		throw new Error("SIGNING_TOKEN_INVALID");
	const [signer] = await tx
		.select()
		.from(contractSigners)
		.where(eq(contractSigners.tokenHash, tokenHash(rawToken)))
		.limit(1)
		.for("update");
	if (!signer) throw new Error("SIGNING_TOKEN_INVALID");
	const [contract] = await tx
		.select()
		.from(contracts)
		.where(eq(contracts.id, signer.contractId))
		.limit(1)
		.for("update");
	if (!contract) throw new Error("CONTRACT_NOT_FOUND");
	return { signer, contract };
}

export async function viewContractForSigning(
	rawToken: string,
	options: { now?: Date } = {},
) {
	const now = options.now ?? new Date();
	return db.transaction(async (tx) => {
		const { signer, contract } = await resolveSignerToken(tx, rawToken);
		if (
			signer.status !== "pending" ||
			!["sent", "partially_signed"].includes(contract.status)
		)
			throw new Error("SIGNING_TOKEN_USED");
		if (
			!signer.tokenExpiresAt ||
			signer.tokenExpiresAt <= now ||
			!contract.signingExpiresAt ||
			contract.signingExpiresAt <= now
		)
			throw new Error("SIGNING_TOKEN_EXPIRED");
		if (!signer.viewedAt) {
			await tx
				.update(contractSigners)
				.set({ viewedAt: now, updatedAt: now })
				.where(eq(contractSigners.id, signer.id));
			await addAuditEvent(tx, {
				workspaceId: contract.workspaceId,
				contractId: contract.id,
				signerId: signer.id,
				eventType: "contract.viewed",
				actorType: "signer",
				actorId: signer.id,
			});
		}
		return {
			contract: {
				id: contract.id,
				number: contract.number,
				title: contract.title,
				description: contract.description,
				clientName: contract.clientName,
				fileVersionId: contract.fileVersionId,
				fileName: contract.fileName,
				fileContentType: contract.fileContentType,
				fileChecksumSha256: contract.fileChecksumSha256,
				effectiveOn: contract.effectiveOn,
				endsOn: contract.endsOn,
				consentText: contract.consentText,
				consentVersion: contract.consentVersion,
				signingExpiresAt: contract.signingExpiresAt,
			},
			signer: {
				id: signer.id,
				name: signer.name,
				email: signer.email,
				role: signer.role,
			},
		};
	});
}

async function decideContract(
	rawToken: string,
	decision: "signed" | "declined",
	evidence?: SignatureEvidenceInput,
	options: { now?: Date } = {},
) {
	const now = options.now ?? new Date();
	const parsedEvidence =
		decision === "signed" ? signatureEvidenceInputSchema.parse(evidence) : null;
	return db.transaction(async (tx) => {
		const { signer, contract } = await resolveSignerToken(tx, rawToken);
		if (
			signer.status !== "pending" ||
			!["sent", "partially_signed"].includes(contract.status)
		)
			throw new Error("SIGNING_TOKEN_USED");
		if (
			!signer.tokenExpiresAt ||
			signer.tokenExpiresAt <= now ||
			!contract.signingExpiresAt ||
			contract.signingExpiresAt <= now
		)
			throw new Error("SIGNING_TOKEN_EXPIRED");
		await tx
			.update(contractSigners)
			.set({
				status: decision,
				tokenHash: null,
				typedName: parsedEvidence?.typedName ?? null,
				consentText: decision === "signed" ? contract.consentText : null,
				consentVersion: decision === "signed" ? contract.consentVersion : null,
				ipAddress: parsedEvidence?.ipAddress ?? null,
				userAgent: parsedEvidence?.userAgent ?? null,
				signedAt: decision === "signed" ? now : null,
				declinedAt: decision === "declined" ? now : null,
				updatedAt: now,
			})
			.where(
				and(
					eq(contractSigners.id, signer.id),
					eq(contractSigners.status, "pending"),
				),
			);
		const remaining = await tx
			.select({ status: contractSigners.status })
			.from(contractSigners)
			.where(eq(contractSigners.contractId, contract.id));
		const status = contractStatusFromSigners(
			remaining.map((item) => item.status),
		);
		const timestamps =
			status === "completed"
				? { completedAt: now }
				: status === "declined"
					? { declinedAt: now }
					: status === "partially_signed" && !contract.partiallySignedAt
						? { partiallySignedAt: now }
						: {};
		const [updated] = await tx
			.update(contracts)
			.set({ status, ...timestamps, updatedAt: now })
			.where(
				and(
					eq(contracts.id, contract.id),
					eq(contracts.status, contract.status),
				),
			)
			.returning();
		if (!updated) throw new Error("CONTRACT_CONCURRENT_UPDATE");
		if (status === "declined")
			await tx
				.update(contractSigners)
				.set({ tokenHash: null, updatedAt: now })
				.where(
					and(
						eq(contractSigners.contractId, contract.id),
						eq(contractSigners.status, "pending"),
					),
				);
		await addAuditEvent(tx, {
			workspaceId: contract.workspaceId,
			contractId: contract.id,
			signerId: signer.id,
			eventType: `contract.${decision}`,
			actorType: "signer",
			actorId: signer.id,
			details:
				decision === "signed"
					? {
							typedName: parsedEvidence?.typedName,
							consentVersion: contract.consentVersion,
							fileChecksumSha256: contract.fileChecksumSha256,
						}
					: {},
		});
		return updated;
	});
}

export function signContract(
	rawToken: string,
	evidence: SignatureEvidenceInput,
	options: { now?: Date } = {},
) {
	return decideContract(rawToken, "signed", evidence, options);
}

export function declineContract(
	rawToken: string,
	options: { now?: Date } = {},
) {
	return decideContract(rawToken, "declined", undefined, options);
}

export async function expireContract(
	workspaceId: string,
	id: string,
	options: { now?: Date } = {},
) {
	const now = options.now ?? new Date();
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(contracts)
			.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("CONTRACT_NOT_FOUND");
		if (!["sent", "partially_signed"].includes(current.status)) {
			throw new Error("CONTRACT_NOT_EXPIRABLE");
		}
		if (!current.signingExpiresAt || current.signingExpiresAt > now) {
			throw new Error("CONTRACT_NOT_EXPIRED");
		}
		const [updated] = await tx
			.update(contracts)
			.set({ status: "expired", expiredAt: now, updatedAt: now })
			.where(and(eq(contracts.id, id), eq(contracts.status, current.status)))
			.returning();
		if (!updated) throw new Error("CONTRACT_CONCURRENT_UPDATE");
		await tx
			.update(contractSigners)
			.set({ tokenHash: null, updatedAt: now })
			.where(eq(contractSigners.contractId, id));
		await addAuditEvent(tx, {
			workspaceId,
			contractId: id,
			eventType: "contract.expired",
			actorType: "system",
		});
		return updated;
	});
}

export async function voidContract(
	workspaceId: string,
	id: string,
	options: { now?: Date; actorId?: string | null } = {},
) {
	const now = options.now ?? new Date();
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(contracts)
			.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("CONTRACT_NOT_FOUND");
		if (!["draft", "sent", "partially_signed"].includes(current.status))
			throw new Error("CONTRACT_NOT_VOIDABLE");
		const [updated] = await tx
			.update(contracts)
			.set({ status: "voided", voidedAt: now, updatedAt: now })
			.where(and(eq(contracts.id, id), eq(contracts.status, current.status)))
			.returning();
		if (!updated) throw new Error("CONTRACT_CONCURRENT_UPDATE");
		await tx
			.update(contractSigners)
			.set({ tokenHash: null, updatedAt: now })
			.where(eq(contractSigners.contractId, id));
		await addAuditEvent(tx, {
			workspaceId,
			contractId: id,
			eventType: "contract.voided",
			actorType: "workspace_user",
			actorId: options.actorId,
		});
		return updated;
	});
}

export async function reviseContract(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(contracts)
			.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("CONTRACT_NOT_FOUND");
		if (!canSupersedeContract(current.status))
			throw new Error("CONTRACT_NOT_REVISABLE");
		const [existing] = await tx
			.select()
			.from(contracts)
			.where(eq(contracts.supersedesId, id))
			.limit(1);
		if (existing) return existing;
		const signers = await tx
			.select()
			.from(contractSigners)
			.where(eq(contractSigners.contractId, id))
			.orderBy(asc(contractSigners.position));
		const revision = current.revision + 1;
		const [created] = await tx
			.insert(contracts)
			.values({
				workspaceId,
				seriesId: current.seriesId,
				supersedesId: current.id,
				clientId: current.clientId,
				clientName: current.clientName,
				clientEmail: current.clientEmail,
				clientCompany: current.clientCompany,
				fileVersionId: current.fileVersionId,
				fileDocumentId: current.fileDocumentId,
				fileName: current.fileName,
				fileContentType: current.fileContentType,
				fileChecksumSha256: current.fileChecksumSha256,
				title: current.title,
				description: current.description,
				numberPrefix: current.numberPrefix,
				sequence: current.sequence,
				revision,
				number: formatContractNumber(
					current.numberPrefix,
					current.sequence,
					revision,
				),
				effectiveOn: current.effectiveOn,
				endsOn: current.endsOn,
				metadata: current.metadata,
			})
			.returning();
		await tx.insert(contractSigners).values(
			signers.map((signer) => ({
				workspaceId,
				contractId: created.id,
				name: signer.name,
				email: signer.email,
				role: signer.role,
				position: signer.position,
			})),
		);
		await addAuditEvent(tx, {
			workspaceId,
			contractId: created.id,
			eventType: "contract.revision_created",
			actorType: "workspace_user",
			details: { supersedesContractId: current.id },
		});
		return created;
	});
}

export async function deleteDraftContract(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: contracts.status })
			.from(contracts)
			.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("CONTRACT_NOT_FOUND");
		if (current.status !== "draft") throw new Error("CONTRACT_NOT_DELETABLE");
		const [deleted] = await tx
			.delete(contracts)
			.where(
				and(
					eq(contracts.workspaceId, workspaceId),
					eq(contracts.id, id),
					eq(contracts.status, "draft"),
				),
			)
			.returning();
		if (!deleted) throw new Error("CONTRACT_CONCURRENT_UPDATE");
		return deleted;
	});
}

export function isTerminalContractStatus(status: ContractStatus): boolean {
	return ["completed", "declined", "expired", "voided", "superseded"].includes(
		status,
	);
}
