import {
	clientRecordsSettingsSchema,
	listClientRecords,
} from "@quickengine/mod-client-records";
import { ClientRecordsView } from "../_components/client-records-view";
import type { ModulePageProps } from "./types";

export default async function ClientRecordsPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const clientSettings = clientRecordsSettingsSchema.parse(settings);
	const records = await listClientRecords(workspaceId);
	return (
		<ClientRecordsView
			workspaceId={workspaceId}
			records={records.map((record) => ({
				id: record.id,
				name: record.name,
				email: record.email,
				phone: record.phone,
				company: record.company,
				notes: record.notes,
				createdAt: record.createdAt.toISOString(),
			}))}
			labelSingular={clientSettings.recordLabelSingular}
			labelPlural={clientSettings.recordLabelPlural}
			fields={clientSettings.fields}
		/>
	);
}
