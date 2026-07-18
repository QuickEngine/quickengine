"use client";

import { FileText, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
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
	EmptyContent,
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
	type ContractActionState,
	changeContractStatusAction,
	createContractAction,
	sendContractAction,
	updateContractAction,
} from "../_lib/contract-actions";

export type ContractStatus =
	| "draft"
	| "sent"
	| "partially_signed"
	| "completed"
	| "declined"
	| "expired"
	| "voided"
	| "superseded";
type SignerStatus = "pending" | "signed" | "declined";

export type ContractClientOption = {
	id: string;
	name: string;
	company: string | null;
};
export type FileVersionOption = { value: string; label: string };
export type ContractSignerView = {
	id: string;
	name: string;
	email: string;
	role: string | null;
	status: SignerStatus;
	viewedAt: string | null;
	signedAt: string | null;
	declinedAt: string | null;
};
export type ContractAuditView = {
	id: string;
	eventType: string;
	actorType: string;
	occurredAt: string;
};
export type ContractViewModel = {
	id: string;
	number: string;
	status: ContractStatus;
	title: string;
	description: string | null;
	clientId: string | null;
	clientName: string | null;
	clientCompany: string | null;
	fileName: string | null;
	fileVersionId: string;
	effectiveOn: string | null;
	endsOn: string | null;
	signingExpiresAt: string | null;
	revision: number;
	createdAt: string;
	signers: ContractSignerView[];
	auditEvents: ContractAuditView[];
};

const INITIAL_STATE: ContractActionState = {
	error: null,
	completionId: null,
	invitations: null,
};
const STATUS_LABEL: Record<ContractStatus, string> = {
	draft: "draft",
	sent: "sent",
	partially_signed: "partially signed",
	completed: "completed",
	declined: "declined",
	expired: "expired",
	voided: "voided",
	superseded: "superseded",
};
const statusVariant = (status: ContractStatus) =>
	status === "voided" || status === "declined" || status === "expired"
		? ("destructive" as const)
		: ("secondary" as const);

function SubmitButton({
	label,
	variant = "default",
}: {
	label: string;
	variant?: "default" | "destructive" | "outline";
}) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" variant={variant} disabled={pending}>
			{pending ? "Working…" : label}
		</Button>
	);
}

type EditableSigner = {
	key: string;
	name: string;
	email: string;
	role: string;
};
const newSigner = (): EditableSigner => ({
	key: crypto.randomUUID(),
	name: "",
	email: "",
	role: "",
});

function ContractFields({
	clients,
	fileVersions,
	contract,
}: {
	clients: ContractClientOption[];
	fileVersions: FileVersionOption[];
	contract?: ContractViewModel;
}) {
	const [signers, setSigners] = useState<EditableSigner[]>(
		contract?.signers.map((signer) => ({
			key: signer.id,
			name: signer.name,
			email: signer.email,
			role: signer.role ?? "",
		})) ?? [newSigner()],
	);
	return (
		<div className="grid max-h-[65vh] gap-5 overflow-y-auto py-3 pr-1">
			<div className="space-y-2">
				<Label>Title</Label>
				<Input
					name="title"
					defaultValue={contract?.title ?? ""}
					placeholder="e.g. Master services agreement"
					maxLength={255}
					required
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Client</Label>
					<NativeSelect
						name="clientId"
						defaultValue={contract?.clientId ?? ""}
						required
					>
						<option value="" disabled>
							Select a client
						</option>
						{clients.map((client) => (
							<option key={client.id} value={client.id}>
								{client.name}
								{client.company ? ` — ${client.company}` : ""}
							</option>
						))}
					</NativeSelect>
				</div>
				<div className="space-y-2">
					<Label>Document version</Label>
					<NativeSelect
						name="fileVersionId"
						defaultValue={contract?.fileVersionId ?? ""}
						required
					>
						<option value="" disabled>
							Select an available document
						</option>
						{fileVersions.map((file) => (
							<option key={file.value} value={file.value}>
								{file.label}
							</option>
						))}
					</NativeSelect>
				</div>
			</div>
			<div className="space-y-2">
				<Label>Description</Label>
				<Textarea
					name="description"
					defaultValue={contract?.description ?? ""}
					maxLength={10_000}
					rows={2}
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Effective on (optional)</Label>
					<Input
						name="effectiveOn"
						type="date"
						defaultValue={contract?.effectiveOn ?? ""}
					/>
				</div>
				<div className="space-y-2">
					<Label>Ends on (optional)</Label>
					<Input
						name="endsOn"
						type="date"
						defaultValue={contract?.endsOn ?? ""}
					/>
				</div>
			</div>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Signers (1–10)</Label>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={signers.length >= 10}
						onClick={() => setSigners((current) => [...current, newSigner()])}
					>
						<Plus className="size-3.5" /> Add signer
					</Button>
				</div>
				{signers.map((signer, index) => (
					<div
						key={signer.key}
						className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_8rem_auto]"
					>
						<Input
							name="signerName"
							aria-label={`Signer ${index + 1} name`}
							placeholder="Name"
							value={signer.name}
							onChange={(event) =>
								setSigners((current) =>
									current.map((item) =>
										item.key === signer.key
											? { ...item, name: event.target.value }
											: item,
									),
								)
							}
							maxLength={200}
							required
						/>
						<Input
							name="signerEmail"
							aria-label={`Signer ${index + 1} email`}
							type="email"
							placeholder="email@company.com"
							value={signer.email}
							onChange={(event) =>
								setSigners((current) =>
									current.map((item) =>
										item.key === signer.key
											? { ...item, email: event.target.value }
											: item,
									),
								)
							}
							required
						/>
						<Input
							name="signerRole"
							aria-label={`Signer ${index + 1} role`}
							placeholder="Role (opt.)"
							value={signer.role}
							onChange={(event) =>
								setSigners((current) =>
									current.map((item) =>
										item.key === signer.key
											? { ...item, role: event.target.value }
											: item,
									),
								)
							}
							maxLength={100}
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={`Remove signer ${index + 1}`}
							disabled={signers.length === 1}
							onClick={() =>
								setSigners((current) =>
									current.filter((item) => item.key !== signer.key),
								)
							}
						>
							<Trash className="size-4" />
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}

function ContractEditor({
	workspaceId,
	clients,
	fileVersions,
	contract,
	trigger,
}: {
	workspaceId: string;
	clients: ContractClientOption[];
	fileVersions: FileVersionOption[];
	contract?: ContractViewModel;
	trigger: React.ReactNode;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [state, action] = useActionState(
		contract ? updateContractAction : createContractAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) {
			setOpen(false);
			router.refresh();
		}
	}, [router, state.completionId]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<form action={action}>
					<input type="hidden" name="workspaceId" value={workspaceId} />
					{contract && (
						<input type="hidden" name="contractId" value={contract.id} />
					)}
					<DialogHeader>
						<DialogTitle>
							{contract ? `Edit ${contract.number}` : "Create agreement"}
						</DialogTitle>
						<DialogDescription>
							{contract
								? "Only drafts can be changed."
								: "Prepare a draft agreement from a document and its signers. Sending it freezes it and issues signing links."}
						</DialogDescription>
					</DialogHeader>
					<ContractFields
						clients={clients}
						fileVersions={fileVersions}
						contract={contract}
					/>
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
						<SubmitButton label={contract ? "Save draft" : "Create draft"} />
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function SendContractForm({
	workspaceId,
	contractId,
}: {
	workspaceId: string;
	contractId: string;
}) {
	const router = useRouter();
	const [state, action] = useActionState(sendContractAction, INITIAL_STATE);
	if (state.invitations) {
		return (
			<div className="w-full space-y-3 rounded-lg border p-3">
				<p className="text-sm">
					Sent. No email is delivered yet — share each one-time signing link
					with its signer:
				</p>
				{state.invitations.map((invitation) => (
					<div key={invitation.email} className="space-y-1">
						<Label className="text-xs">
							{invitation.name} — {invitation.email}
						</Label>
						<Input
							readOnly
							value={invitation.url}
							onFocus={(event) => event.target.select()}
						/>
					</div>
				))}
				<Button type="button" onClick={() => router.refresh()}>
					Done
				</Button>
			</div>
		);
	}
	return (
		<form action={action}>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="contractId" value={contractId} />
			<SubmitButton label="Send for signing" />
			{state.error && (
				<p role="alert" className="mt-2 text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}

function TransitionForm({
	workspaceId,
	contractId,
	target,
	label,
	variant = "default",
}: {
	workspaceId: string;
	contractId: string;
	target: string;
	label: string;
	variant?: "default" | "destructive" | "outline";
}) {
	const router = useRouter();
	const [state, action] = useActionState(
		changeContractStatusAction,
		INITIAL_STATE,
	);
	useEffect(() => {
		if (state.completionId) router.refresh();
	}, [router, state.completionId]);
	return (
		<form action={action}>
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="contractId" value={contractId} />
			<input type="hidden" name="target" value={target} />
			<SubmitButton label={label} variant={variant} />
			{state.error && (
				<p role="alert" className="mt-2 text-destructive text-xs">
					{state.error}
				</p>
			)}
		</form>
	);
}

function ContractDetails({
	workspaceId,
	contract,
	clients,
	fileVersions,
}: {
	workspaceId: string;
	contract: ContractViewModel;
	clients: ContractClientOption[];
	fileVersions: FileVersionOption[];
}) {
	const [open, setOpen] = useState(false);
	const signed = contract.signers.filter(
		(signer) => signer.status === "signed",
	).length;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button type="button" className="font-medium hover:underline">
					{contract.number}
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<div className="flex flex-wrap items-center gap-2">
						<DialogTitle>{contract.number}</DialogTitle>
						<Badge variant={statusVariant(contract.status)}>
							{STATUS_LABEL[contract.status]}
						</Badge>
					</div>
					<DialogDescription>
						{contract.title} · {contract.clientName ?? "No client snapshot"}
						{contract.clientCompany ? ` — ${contract.clientCompany}` : ""}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid gap-1 text-sm">
						<div className="text-muted-foreground">
							Document: {contract.fileName ?? "—"}
						</div>
						{contract.effectiveOn && (
							<div className="text-muted-foreground">
								Effective {contract.effectiveOn}
								{contract.endsOn ? ` → ${contract.endsOn}` : ""}
							</div>
						)}
						{contract.signingExpiresAt && (
							<div className="text-muted-foreground">
								Signing closes {contract.signingExpiresAt.slice(0, 10)}
							</div>
						)}
					</div>
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										Signer ({signed}/{contract.signers.length})
									</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{contract.signers.map((signer) => (
									<TableRow key={signer.id}>
										<TableCell>
											<div>{signer.name}</div>
											<div className="text-muted-foreground text-xs">
												{signer.email}
											</div>
										</TableCell>
										<TableCell>{signer.role ?? "—"}</TableCell>
										<TableCell>
											<Badge
												variant={
													signer.status === "declined"
														? "destructive"
														: "secondary"
												}
											>
												{signer.status}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					{contract.auditEvents.length > 0 && (
						<details className="rounded-lg border p-3 text-sm">
							<summary className="cursor-pointer text-muted-foreground">
								Audit history ({contract.auditEvents.length})
							</summary>
							<ul className="mt-2 space-y-1">
								{contract.auditEvents.map((event) => (
									<li key={event.id} className="text-muted-foreground text-xs">
										{event.occurredAt.slice(0, 19).replace("T", " ")} ·{" "}
										{event.eventType} ({event.actorType})
									</li>
								))}
							</ul>
						</details>
					)}
				</div>
				<DialogFooter className="flex-wrap items-end gap-2 sm:justify-end">
					{contract.status === "draft" && (
						<>
							<TransitionForm
								workspaceId={workspaceId}
								contractId={contract.id}
								target="delete"
								label="Delete draft"
								variant="destructive"
							/>
							<ContractEditor
								workspaceId={workspaceId}
								clients={clients}
								fileVersions={fileVersions}
								contract={contract}
								trigger={<Button variant="outline">Edit draft</Button>}
							/>
							<SendContractForm
								workspaceId={workspaceId}
								contractId={contract.id}
							/>
						</>
					)}
					{(contract.status === "sent" ||
						contract.status === "partially_signed") && (
						<>
							<TransitionForm
								workspaceId={workspaceId}
								contractId={contract.id}
								target="void"
								label="Void"
								variant="destructive"
							/>
							<TransitionForm
								workspaceId={workspaceId}
								contractId={contract.id}
								target="expire"
								label="Mark expired"
								variant="outline"
							/>
						</>
					)}
					{(contract.status === "sent" ||
						contract.status === "partially_signed" ||
						contract.status === "completed" ||
						contract.status === "declined" ||
						contract.status === "expired") && (
						<TransitionForm
							workspaceId={workspaceId}
							contractId={contract.id}
							target="revise"
							label="Revise"
							variant="outline"
						/>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ContractsView({
	workspaceId,
	contracts,
	clients,
	fileVersions,
}: {
	workspaceId: string;
	contracts: ContractViewModel[];
	clients: ContractClientOption[];
	fileVersions: FileVersionOption[];
}) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const visible = useMemo(
		() =>
			contracts.filter(
				(contract) =>
					(status === "all" || contract.status === status) &&
					[contract.number, contract.title, contract.clientName]
						.filter(Boolean)
						.join(" ")
						.toLowerCase()
						.includes(query.trim().toLowerCase()),
			),
		[contracts, query, status],
	);
	const canCreate = clients.length > 0 && fileVersions.length > 0;
	const create = (
		<ContractEditor
			workspaceId={workspaceId}
			clients={clients}
			fileVersions={fileVersions}
			trigger={
				<Button disabled={!canCreate}>
					<Plus className="size-4" /> Create agreement
				</Button>
			}
		/>
	);
	return (
		<section className="mt-8 space-y-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-1 flex-wrap gap-2">
					<div className="relative w-full max-w-sm">
						<MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search agreements…"
							className="pl-9"
						/>
					</div>
					<NativeSelect
						value={status}
						onChange={(event) => setStatus(event.target.value)}
						className="w-44"
					>
						<option value="all">All statuses</option>
						<option value="draft">Draft</option>
						<option value="sent">Sent</option>
						<option value="partially_signed">Partially signed</option>
						<option value="completed">Completed</option>
						<option value="declined">Declined</option>
						<option value="expired">Expired</option>
						<option value="voided">Voided</option>
						<option value="superseded">Superseded</option>
					</NativeSelect>
				</div>
				{create}
			</div>
			{!canCreate && (
				<p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
					Add a Client Record and upload a document in Files before preparing an
					agreement.
				</p>
			)}
			{contracts.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FileText />
						</EmptyMedia>
						<EmptyTitle>No agreements yet</EmptyTitle>
						<EmptyDescription>
							Prepare an agreement from a document and its signers, then send it
							for signing.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>{create}</EmptyContent>
				</Empty>
			) : visible.length === 0 ? (
				<div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
					No agreements match these filters.
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-4">Number</TableHead>
								<TableHead>Title</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Signers</TableHead>
								<TableHead className="pr-4">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visible.map((contract) => {
								const signed = contract.signers.filter(
									(signer) => signer.status === "signed",
								).length;
								return (
									<TableRow key={contract.id}>
										<TableCell className="pl-4">
											<ContractDetails
												workspaceId={workspaceId}
												contract={contract}
												clients={clients}
												fileVersions={fileVersions}
											/>
										</TableCell>
										<TableCell className="max-w-[14rem] truncate">
											{contract.title}
										</TableCell>
										<TableCell>{contract.clientName ?? "—"}</TableCell>
										<TableCell>
											{signed}/{contract.signers.length}
										</TableCell>
										<TableCell className="pr-4">
											<Badge variant={statusVariant(contract.status)}>
												{STATUS_LABEL[contract.status]}
											</Badge>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}
