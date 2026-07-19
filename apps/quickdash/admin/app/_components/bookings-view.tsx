"use client";

import {
	CalendarBlank,
	MagnifyingGlass,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@quickengine/ui/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@quickengine/ui/components/ui/empty";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@quickengine/ui/components/ui/table";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type BookingActionState,
	changeBookingStatusAction,
	createBookingAction,
	deleteBookingAction,
} from "../_lib/booking-actions";

type Status =
	| "requested"
	| "confirmed"
	| "checked_in"
	| "completed"
	| "cancelled"
	| "no_show";
export type BookingViewModel = {
	id: string;
	title: string;
	clientName: string;
	clientCompany: string | null;
	status: Status;
	scheduleKey: string;
	startsAt: string;
	endsAt: string;
	timeZone: string;
	locationKind: string;
	location: string | null;
	notes: string | null;
};
const INITIAL: BookingActionState = { error: null, completionId: null };
const title = (value: string) =>
	value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const transitions: Record<Status, Status[]> = {
	requested: ["confirmed", "cancelled"],
	confirmed: ["checked_in", "completed", "cancelled", "no_show"],
	checked_in: ["completed", "cancelled"],
	completed: [],
	cancelled: [],
	no_show: [],
};

function Submit({
	children,
	destructive = false,
}: {
	children: React.ReactNode;
	destructive?: boolean;
}) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			disabled={pending}
			variant={destructive ? "destructive" : "default"}
		>
			{pending ? "Working…" : children}
		</Button>
	);
}

function CreateDialog({
	workspaceId,
	clients,
	defaultTimeZone,
	defaultDuration,
}: {
	workspaceId: string;
	clients: Array<{ id: string; name: string; company: string | null }>;
	defaultTimeZone: string;
	defaultDuration: number;
}) {
	const [open, setOpen] = useState(false);
	const [startsLocal, setStartsLocal] = useState("");
	const [endsLocal, setEndsLocal] = useState("");
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [state, action] = useActionState(createBookingAction, INITIAL);
	const router = useRouter();
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			setIdempotencyKey(crypto.randomUUID());
			router.refresh();
		}
	}, [state.completionId, router]);
	const updateStart = (value: string) => {
		setStartsLocal(value);
		const start = new Date(value);
		if (!Number.isNaN(start.getTime()))
			setEndsLocal(
				new Date(start.getTime() + defaultDuration * 60_000)
					.toISOString()
					.slice(0, 16),
			);
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button disabled={clients.length === 0}>
					<Plus className="size-4" /> New booking
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					<input
						type="hidden"
						name="startsAt"
						value={startsLocal ? new Date(startsLocal).toISOString() : ""}
					/>
					<input
						type="hidden"
						name="endsAt"
						value={endsLocal ? new Date(endsLocal).toISOString() : ""}
					/>
					<DialogHeader>
						<DialogTitle>Schedule booking</DialogTitle>
						<DialogDescription>
							Create an appointment on an independent schedule. Reminders and
							external calendar sync are not sent from this form.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label>Client</Label>
							<NativeSelect name="clientId" required>
								<option value="">Select a client</option>
								{clients.map((client) => (
									<option key={client.id} value={client.id}>
										{client.name}
										{client.company ? ` — ${client.company}` : ""}
									</option>
								))}
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label>Title</Label>
							<Input name="title" maxLength={200} required />
						</div>
						<div className="space-y-2">
							<Label>Starts</Label>
							<Input
								type="datetime-local"
								value={startsLocal}
								onChange={(event) => updateStart(event.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Ends</Label>
							<Input
								type="datetime-local"
								value={endsLocal}
								onChange={(event) => setEndsLocal(event.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Timezone</Label>
							<Input name="timeZone" defaultValue={defaultTimeZone} required />
						</div>
						<div className="space-y-2">
							<Label>Schedule key</Label>
							<Input
								name="scheduleKey"
								defaultValue="default"
								pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Location type</Label>
							<NativeSelect name="locationKind">
								<option value="in_person">In person</option>
								<option value="virtual">Virtual</option>
								<option value="phone">Phone</option>
								<option value="other">Other</option>
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label>Location or meeting link</Label>
							<Input name="location" maxLength={500} />
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label>Notes</Label>
							<Textarea name="notes" maxLength={10000} />
						</div>
					</div>
					{state.error && (
						<p className="mb-3 text-destructive text-sm">{state.error}</p>
					)}
					<DialogFooter>
						<Submit>Create booking</Submit>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Action({
	workspaceId,
	bookingId,
	target,
	remove = false,
}: {
	workspaceId: string;
	bookingId: string;
	target?: Status;
	remove?: boolean;
}) {
	const [state, action] = useActionState(
		remove ? deleteBookingAction : changeBookingStatusAction,
		INITIAL,
	);
	return (
		<form action={action} className="inline-flex flex-col gap-1">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="bookingId" value={bookingId} />
			{target && <input type="hidden" name="target" value={target} />}
			<Submit destructive={remove || target === "cancelled"}>
				{remove ? (
					<>
						<Trash className="size-4" /> Delete
					</>
				) : (
					title(target ?? "")
				)}
			</Submit>
			{state.error && (
				<span className="max-w-52 text-destructive text-xs">{state.error}</span>
			)}
		</form>
	);
}

function Details({
	workspaceId,
	booking,
}: {
	workspaceId: string;
	booking: BookingViewModel;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					Manage
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{booking.title}</DialogTitle>
					<DialogDescription>
						{booking.clientName} · {booking.scheduleKey}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 text-sm">
					<div className="rounded-lg border p-3">
						<p>
							{new Date(booking.startsAt).toLocaleString()} –{" "}
							{new Date(booking.endsAt).toLocaleString()}
						</p>
						<p className="text-muted-foreground">
							Stored timezone: {booking.timeZone}
						</p>
						<p className="mt-2">
							{title(booking.locationKind)}
							{booking.location ? ` · ${booking.location}` : ""}
						</p>
						{booking.notes && (
							<p className="mt-2 whitespace-pre-wrap text-muted-foreground">
								{booking.notes}
							</p>
						)}
					</div>
					<div className="flex flex-wrap gap-2">
						{transitions[booking.status].map((target) => (
							<Action
								key={target}
								workspaceId={workspaceId}
								bookingId={booking.id}
								target={target}
							/>
						))}
						{(["requested", "cancelled"] as Status[]).includes(
							booking.status,
						) && (
							<Action workspaceId={workspaceId} bookingId={booking.id} remove />
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function BookingsView({
	workspaceId,
	bookings,
	clients,
	defaultTimeZone,
	defaultDuration,
}: {
	workspaceId: string;
	bookings: BookingViewModel[];
	clients: Array<{ id: string; name: string; company: string | null }>;
	defaultTimeZone: string;
	defaultDuration: number;
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const filtered = useMemo(
		() =>
			bookings.filter(
				(booking) =>
					(status === "all" || booking.status === status) &&
					`${booking.title} ${booking.clientName} ${booking.scheduleKey}`
						.toLowerCase()
						.includes(query.toLowerCase()),
			),
		[bookings, query, status],
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-medium text-lg">Booking calendar</h2>
					<p className="text-muted-foreground text-sm">
						Schedule and operate client appointments without double-booking a
						calendar.
					</p>
				</div>
				<CreateDialog
					workspaceId={workspaceId}
					clients={clients}
					defaultTimeZone={defaultTimeZone}
					defaultDuration={defaultDuration}
				/>
			</div>
			<div className="flex gap-2">
				<div className="relative flex-1">
					<MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search bookings"
					/>
				</div>
				<NativeSelect
					className="w-44"
					value={status}
					onChange={(event) => setStatus(event.target.value)}
				>
					<option value="all">All statuses</option>
					{Object.keys(transitions).map((value) => (
						<option key={value} value={value}>
							{title(value)}
						</option>
					))}
				</NativeSelect>
			</div>
			{filtered.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarBlank />
						</EmptyMedia>
						<EmptyTitle>
							{bookings.length ? "No matching bookings" : "No bookings yet"}
						</EmptyTitle>
						<EmptyDescription>
							{clients.length
								? "Schedule the first client appointment."
								: "Create a Client Record before scheduling an appointment."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Booking</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Starts</TableHead>
								<TableHead>Schedule</TableHead>
								<TableHead>Status</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((booking) => (
								<TableRow key={booking.id}>
									<TableCell className="font-medium">{booking.title}</TableCell>
									<TableCell>{booking.clientName}</TableCell>
									<TableCell>
										{new Date(booking.startsAt).toLocaleString()}
									</TableCell>
									<TableCell>{booking.scheduleKey}</TableCell>
									<TableCell>
										<Badge variant="secondary">{title(booking.status)}</Badge>
									</TableCell>
									<TableCell className="text-right">
										<Details workspaceId={workspaceId} booking={booking} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}
