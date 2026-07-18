import { listClientRecords } from "@quickengine/mod-client-records";
import { getContract, listContracts } from "@quickengine/mod-contracts-esign";
import { getFileDocument, listFileDocuments } from "@quickengine/mod-files";
import { ContractsView } from "../_components/contracts-view";
import type { ModulePageProps } from "./types";

export default async function ContractsPage({ workspaceId }: ModulePageProps) {
	const contractRows = await listContracts(workspaceId);
	const contractDetails = await Promise.all(
		contractRows.map((contract) => getContract(workspaceId, contract.id)),
	);
	const clients = await listClientRecords(workspaceId);
	const fileDocs = await listFileDocuments(workspaceId);
	const fileDetails = await Promise.all(
		fileDocs.map((document) => getFileDocument(workspaceId, document.id)),
	);
	const fileVersions = fileDetails.flatMap((document) => {
		if (!document) return [];
		return document.versions
			.filter((version) => version.status === "available")
			.map((version) => ({
				value: version.id,
				label: `${document.title} · v${version.versionNumber}${
					version.originalName ? ` (${version.originalName})` : ""
				}`,
			}));
	});
	return (
		<ContractsView
			workspaceId={workspaceId}
			clients={clients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			fileVersions={fileVersions}
			contracts={contractDetails.flatMap((contract) => {
				if (!contract) return [];
				return [
					{
						id: contract.id,
						number: contract.number,
						status: contract.status,
						title: contract.title,
						description: contract.description,
						clientId: contract.clientId,
						clientName: contract.clientName,
						clientCompany: contract.clientCompany,
						fileName: contract.fileName,
						fileVersionId: contract.fileVersionId,
						effectiveOn: contract.effectiveOn,
						endsOn: contract.endsOn,
						signingExpiresAt: contract.signingExpiresAt
							? contract.signingExpiresAt.toISOString()
							: null,
						revision: contract.revision,
						createdAt: contract.createdAt.toISOString(),
						signers: contract.signers.map((signer) => ({
							id: signer.id,
							name: signer.name,
							email: signer.email,
							role: signer.role,
							status: signer.status,
							viewedAt: signer.viewedAt ? signer.viewedAt.toISOString() : null,
							signedAt: signer.signedAt ? signer.signedAt.toISOString() : null,
							declinedAt: signer.declinedAt
								? signer.declinedAt.toISOString()
								: null,
						})),
						auditEvents: contract.auditEvents.map((event) => ({
							id: event.id,
							eventType: event.eventType,
							actorType: event.actorType,
							occurredAt: event.occurredAt.toISOString(),
						})),
					},
				];
			})}
		/>
	);
}
