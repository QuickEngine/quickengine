import {
	bookingsSettingsSchema,
	listBookings,
} from "@quickengine/mod-bookings";
import { listClientRecords } from "@quickengine/mod-client-records";
import { BookingsView } from "../_components/bookings-view";
import type { ModulePageProps } from "./types";

export default async function BookingsPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const bookingsSettings = bookingsSettingsSchema.parse(settings);
	const bookingRows = await listBookings(workspaceId);
	const bookingClients = await listClientRecords(workspaceId);
	return (
		<BookingsView
			workspaceId={workspaceId}
			defaultTimeZone={bookingsSettings.defaultTimeZone}
			defaultDuration={bookingsSettings.defaultDurationMinutes}
			clients={bookingClients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			bookings={bookingRows.map((booking) => ({
				id: booking.id,
				title: booking.title,
				clientName: booking.clientName,
				clientCompany: null,
				status: booking.status,
				scheduleKey: booking.scheduleKey,
				startsAt: booking.startsAt.toISOString(),
				endsAt: booking.endsAt.toISOString(),
				timeZone: booking.timeZone,
				locationKind: booking.locationKind,
				location: booking.location,
				notes: booking.notes,
			}))}
		/>
	);
}
