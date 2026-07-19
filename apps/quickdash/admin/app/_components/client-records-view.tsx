"use client";

import { MagnifyingGlass, Plus, User } from "@phosphor-icons/react";
import { useWorkspaceRealtime } from "@quickengine/realtime/client";
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
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@quickengine/ui/components/ui/empty";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
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
import {
	useActionState,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useFormStatus } from "react-dom";
import {
	type ClientRecordActionState,
	createClientRecordAction,
	deleteClientRecordAction,
	updateClientRecordAction,
} from "../_lib/client-record-actions";

export type ClientRecordViewModel = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string | null;
	notes: string | null;
	createdAt: string;
};

type VisibleFields = {
	phone: boolean;
	company: boolean;
	notes: boolean;
};

const INITIAL_STATE: ClientRecordActionState = {
	error: null,
	completionId: null,
};

function SubmitButton({ label }: { label: string }) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Saving…" : label}
		</Button>
	);
}

function DeleteButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" variant="destructive" disabled={pending}>
			{pending ? "Deleting…" : "Delete client"}
		</Button>
	);
}

function ClientFields({
	record,
	fields,
}: {
	record?: ClientRecordViewModel;
	fields: VisibleFields;
}) {
	return (
		<div className="grid gap-4 py-2">
			<div className="space-y-2">
				<Label htmlFor={`name-${record?.id ?? "new"}`}>Name</Label>
				<Input
					id={`name-${record?.id ?? "new"}`}
					name="name"
					defaultValue={record?.name ?? ""}
					maxLength={200}
					required
					autoFocus
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`email-${record?.id ?? "new"}`}>Email</Label>
				<Input
					id={`email-${record?.id ?? "new"}`}
					name="email"
					type="email"
					defaultValue={record?.email ?? ""}
					maxLength={320}
				/>
			</div>
			{fields.phone && (
				<div className="space-y-2">
					<Label htmlFor={`phone-${record?.id ?? "new"}`}>Phone</Label>
					<Input
						id={`phone-${record?.id ?? "new"}`}
						name="phone"
						type="tel"
						defaultValue={record?.phone ?? ""}
						maxLength={50}
					/>
				</div>
			)}
			{fields.company && (
				<div className="space-y-2">
					<Label htmlFor={`company-${record?.id ?? "new"}`}>Company</Label>
					<Input
						id={`company-${record?.id ?? "new"}`}
						name="company"
						defaultValue={record?.company ?? ""}
						maxLength={200}
					/>
				</div>
			)}
			{fields.notes && (
				<div className="space-y-2">
					<Label htmlFor={`notes-${record?.id ?? "new"}`}>Notes</Label>
					<Textarea
						id={`notes-${record?.id ?? "new"}`}
						name="notes"
						defaultValue={record?.notes ?? ""}
						maxLength={10_000}
						rows={4}
					/>
				</div>
			)}
		</div>
	);
}

function CreateClientDialog({
	workspaceId,
	label,
	fields,
}: {
	workspaceId: string;
	label: string;
	fields: VisibleFields;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	// A per-submit idempotency key so a double-fire creates only one record; a fresh key
	// is minted after each successful create.
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		crypto.randomUUID(),
	);
	const [state, action] = useActionState(
		createClientRecordAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			setIdempotencyKey(crypto.randomUUID());
			router.refresh();
		}
	}, [router, state.completionId]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="size-4" />
					Add {label.toLowerCase()}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					<DialogHeader>
						<DialogTitle>Add {label.toLowerCase()}</DialogTitle>
						<DialogDescription>
							Create a shared record that other enabled modules can reference.
						</DialogDescription>
					</DialogHeader>
					<ClientFields fields={fields} />
					{state.error && (
						<p role="alert" className="mb-3 text-destructive text-sm">
							{state.error}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<SubmitButton label={`Add ${label.toLowerCase()}`} />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ClientDialog({
	workspaceId,
	record,
	label,
	fields,
}: {
	workspaceId: string;
	record: ClientRecordViewModel;
	label: string;
	fields: VisibleFields;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [editState, editAction] = useActionState(
		updateClientRecordAction,
		INITIAL_STATE,
	);
	const [deleteState, deleteAction] = useActionState(
		deleteClientRecordAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (editState.completionId || deleteState.completionId) {
			setOpen(false);
			setDeleting(false);
			router.refresh();
		}
	}, [deleteState.completionId, editState.completionId, router]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button type="button" className="font-medium hover:underline">
					{record.name}
				</button>
			</DialogTrigger>
			<DialogContent>
				{deleting ? (
					<form action={deleteAction}>
						<input type="hidden" name="workspaceId" value={workspaceId} />
						<input type="hidden" name="recordId" value={record.id} />
						<DialogHeader>
							<DialogTitle>Delete {record.name}?</DialogTitle>
							<DialogDescription>
								This permanently removes the {label.toLowerCase()} record.
								Deletion is blocked when another business record still
								references it.
							</DialogDescription>
						</DialogHeader>
						{deleteState.error && (
							<p role="alert" className="my-4 text-destructive text-sm">
								{deleteState.error}
							</p>
						)}
						<DialogFooter className="mt-5">
							<Button
								type="button"
								variant="outline"
								onClick={() => setDeleting(false)}
							>
								Keep {label.toLowerCase()}
							</Button>
							<DeleteButton />
						</DialogFooter>
					</form>
				) : (
					<form action={editAction}>
						<input type="hidden" name="workspaceId" value={workspaceId} />
						<input type="hidden" name="recordId" value={record.id} />
						<DialogHeader>
							<DialogTitle>Edit {label.toLowerCase()}</DialogTitle>
							<DialogDescription>
								Changes apply to this workspace's shared client record.
							</DialogDescription>
						</DialogHeader>
						<ClientFields record={record} fields={fields} />
						{editState.error && (
							<p role="alert" className="mb-3 text-destructive text-sm">
								{editState.error}
							</p>
						)}
						<DialogFooter className="justify-between sm:justify-between">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setDeleting(true)}
							>
								Delete
							</Button>
							<SubmitButton label="Save changes" />
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
	year: "numeric",
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

export function ClientRecordsView({
	workspaceId,
	records,
	labelSingular,
	labelPlural,
	fields,
}: {
	workspaceId: string;
	records: ClientRecordViewModel[];
	labelSingular: string;
	labelPlural: string;
	fields: VisibleFields;
}) {
	const router = useRouter();
	const [query, setQuery] = useState("");

	// Live updates: when another session changes a client record in this workspace,
	// the event bus publishes to the workspace channel; refetch authoritative state.
	const onRealtimeEvent = useCallback(
		(eventName: string) => {
			if (eventName.startsWith("client_records.")) router.refresh();
		},
		[router],
	);
	useWorkspaceRealtime(workspaceId, onRealtimeEvent);

	const visibleRecords = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return records;
		}
		return records.filter((record) =>
			[record.name, record.email, record.phone, record.company]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(normalized),
		);
	}, [query, records]);

	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative w-full sm:max-w-sm">
					<MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={`Search ${labelPlural.toLowerCase()}…`}
						className="pl-9"
					/>
				</div>
				<CreateClientDialog
					workspaceId={workspaceId}
					label={labelSingular}
					fields={fields}
				/>
			</div>

			{records.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<User />
						</EmptyMedia>
						<EmptyTitle>No {labelPlural.toLowerCase()} yet</EmptyTitle>
						<EmptyDescription>
							Add the first {labelSingular.toLowerCase()} to create the shared
							record used by invoices, payments, orders, projects, and more.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<CreateClientDialog
							workspaceId={workspaceId}
							label={labelSingular}
							fields={fields}
						/>
					</EmptyContent>
				</Empty>
			) : visibleRecords.length === 0 ? (
				<div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
					No {labelPlural.toLowerCase()} match “{query.trim()}”.
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-4">Name</TableHead>
								{fields.company && <TableHead>Company</TableHead>}
								<TableHead>Email</TableHead>
								{fields.phone && <TableHead>Phone</TableHead>}
								<TableHead>Added</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleRecords.map((record) => (
								<TableRow key={record.id}>
									<TableCell className="pl-4">
										<ClientDialog
											workspaceId={workspaceId}
											record={record}
											label={labelSingular}
											fields={fields}
										/>
									</TableCell>
									{fields.company && (
										<TableCell>{record.company || "—"}</TableCell>
									)}
									<TableCell>
										{record.email ? (
											<a
												className="hover:underline"
												href={`mailto:${record.email}`}
											>
												{record.email}
											</a>
										) : (
											"—"
										)}
									</TableCell>
									{fields.phone && (
										<TableCell>
											{record.phone ? (
												<a
													className="hover:underline"
													href={`tel:${record.phone}`}
												>
													{record.phone}
												</a>
											) : (
												"—"
											)}
										</TableCell>
									)}
									<TableCell>
										{DATE_FORMAT.format(new Date(record.createdAt))}
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
