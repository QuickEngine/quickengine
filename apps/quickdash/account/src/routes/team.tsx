import {
	CaretDownIcon,
	CheckIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../components/page-state";
import { isPlanLimit, PlanLimitDialog } from "../components/plan-limit-dialog";
import { SkeletonRows } from "../components/skeletons";
import { accountQueries, useActiveOrganization } from "../lib/account-api";
import { api } from "../lib/api";

/**
 * People → Members. Everyone who can get into this organization's businesses.
 *
 * Invitations that have not been accepted yet are their own page: one is a list
 * of people, the other is a list of promises, and they age differently.
 *
 * 🔴 **Membership is organization-wide, not per workspace.** Somebody added here
 * reaches EVERY workspace this organization owns, at their role. It is the most
 * surprising fact in the whole model and the reason unrelated businesses belong
 * in separate organizations, so the page says it out loud rather than leaving it
 * to be discovered.
 *
 * The owner's role is fixed. Transferring ownership is a deliberate separate act,
 * not an edit to a dropdown — and an organization with no owner has nobody who
 * can manage billing or appoint a replacement.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const dangerAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[#ff3b3b]/25 px-3 text-[11px] text-[#ff6b6b] outline-none transition-colors hover:bg-[#ff3b3b]/[0.08] focus-visible:bg-[#ff3b3b]/[0.08] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 min-w-0 flex-1 rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

const ROLES = [
	{ id: "member", label: "Member", detail: "Works in the workspaces" },
	{ id: "admin", label: "Admin", detail: "Manages people and settings" },
	{ id: "owner", label: "Owner", detail: "Everything, including billing" },
] as const;

const joined = (value: string) =>
	new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value));

/**
 * The role picker.
 *
 * 🔴 Never a native `<select>`. The operating system draws that menu itself —
 * its own font, its own colours, its own corner radius — so on a dark console it
 * arrives as a bright grey rectangle from another application. Every control in
 * this product is drawn by this product.
 */
function RoleSelect({
	value,
	onChange,
	compact = false,
	disabled = false,
}: {
	value: string;
	onChange: (value: string) => void;
	/** Row-sized rather than form-sized. */
	compact?: boolean;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const current =
		ROLES.find((option) => option.id === value) ??
		({ id: value, label: value, detail: "Custom role" } as const);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				disabled={disabled}
				className={`flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--console-line-strong)] text-[var(--ink-70)] capitalize outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)] disabled:pointer-events-none disabled:opacity-40 ${
					compact ? "h-7 px-2.5 text-[11px]" : "h-9 px-3.5 text-[12.5px]"
				}`}
			>
				{current.label}
				<CaretDownIcon size={11} className="text-[var(--ink-30)]" />
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="end"
				sideOffset={6}
				aria-label="Choose a role"
				className="w-56 rounded-lg border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
			>
				{ROLES.map((option) => (
					<button
						key={option.id}
						type="button"
						onClick={() => {
							onChange(option.id);
							setOpen(false);
						}}
						className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] focus-visible:bg-[rgb(var(--console-ink)/0.055)]"
					>
						<span className="min-w-0 flex-1">
							<span className="block text-[12px] text-[var(--ink-85)]">
								{option.label}
							</span>
							{/* What the role actually means, at the moment you pick it —
							    the one place somebody is deciding. */}
							<span className="mt-0.5 block text-[10.5px] text-[var(--ink-30)]">
								{option.detail}
							</span>
						</span>
						{option.id === value ? (
							<CheckIcon
								size={13}
								className="mt-0.5 shrink-0 text-[var(--ink-45)]"
							/>
						) : null}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}

function TeamPage() {
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const queryClient = useQueryClient();
	const members = useQuery(accountQueries.members(organizationId));

	const [query, setQuery] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<string>("member");
	const [failure, setFailure] = useState<string | null>(null);
	const [planLimit, setPlanLimit] = useState<string | null>(null);
	const [inviteUrl, setInviteUrl] = useState<string | null>(null);
	const [_emailed, setEmailed] = useState<{
		sent: boolean;
		reason: string | null;
	} | null>(null);
	const [copied, setCopied] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: ["account", organizationId, "members"],
		});
		void queryClient.invalidateQueries({
			queryKey: ["account", organizationId, "invitations"],
		});
	};

	const invite = useMutation({
		mutationFn: async () =>
			api.request<{
				id: string;
				url: string;
				emailed: boolean;
				emailFailure: string | null;
			}>(
				`/account/invitations?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "POST", body: { email: email.trim(), role } },
			),
		onSuccess: ({ data }) => {
			setEmail("");
			setFailure(null);
			setCopied(false);
			// 🔴 The invitation link, shown once to the person who sent it.
			//
			// The token is stored hashed, so this is the only moment it exists in
			// readable form — and mail can fail silently. Without this, an
			// invitation that did not arrive has no remedy except revoking it and
			// guessing again.
			setInviteUrl(data.url ?? null);
			setEmailed({ sent: data.emailed, reason: data.emailFailure });
			refresh();
		},
		/**
		 * 🔴 A seat limit is not an error, and is not shown as one.
		 *
		 * The server refuses escalation AND enforces the seat limit, and the two
		 * arrive down the same path — but they mean opposite things. Escalation is
		 * "you may not do that". A full plan is "you want more of this", which is
		 * the best news a business gets. Rendering both as red failure text taught
		 * people that growing was a mistake they had made.
		 */
		onError: (error: { code?: string; message?: string }) => {
			if (isPlanLimit(error)) {
				setPlanLimit(error.message);
				return;
			}
			setFailure(error?.message ?? "That invitation could not be sent.");
		},
	});

	const changeRole = useMutation({
		mutationFn: async (input: { userId: string; role: string }) =>
			api.request(
				`/account/members/${input.userId}?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "PATCH", body: { role: input.role } },
			),
		onSuccess: () => {
			setFailure(null);
			refresh();
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That role could not be changed."),
	});

	const remove = useMutation({
		mutationFn: async (userId: string) =>
			api.request(
				`/account/members/${userId}?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "DELETE" },
			),
		onSuccess: () => {
			setConfirmRemove(null);
			refresh();
		},
		onError: (error: { message?: string }) => {
			setConfirmRemove(null);
			setFailure(error?.message ?? "That member could not be removed.");
		},
	});

	const needle = query.trim().toLowerCase();
	const people = (members.data?.items ?? []).filter((member) =>
		needle
			? `${member.name ?? ""} ${member.email} ${member.role}`
					.toLowerCase()
					.includes(needle)
			: true,
	);

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (email.trim()) invite.mutate();
				}}
				className="mb-3 flex flex-wrap items-center gap-2"
			>
				<div className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
					<MagnifyingGlassIcon
						size={14}
						className="shrink-0 text-[var(--ink-30)]"
					/>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search people"
						className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
					/>
				</div>

				<input
					type="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="name@company.com"
					aria-label="Email to invite"
					className={`${field} max-w-64`}
				/>
				<RoleSelect value={role} onChange={setRole} />
				<button
					type="submit"
					disabled={!email.trim() || invite.isPending}
					className={`${primaryAction} ${invite.isPending ? "shimmer-busy" : ""}`}
				>
					{invite.isPending ? "Inviting…" : "Invite"}
				</button>
			</form>

			<p className="mb-5 max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
				People belong to the organization, not to one workspace. Anyone here can
				open every workspace {active?.name ?? "this organization"} owns, at
				their role — keep unrelated businesses in separate organizations.
			</p>

			{failure ? (
				<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
			) : null}

			{inviteUrl ? (
				<div className="mb-6 rounded-lg border border-[var(--console-line-strong)] p-3.5">
					<p className="text-[12px] text-[var(--ink-75)]">
						Invitation sent. This link is the only copy — send it directly if
						the email does not arrive.
					</p>
					<div className="mt-2.5 flex items-center gap-2">
						<p className="min-w-0 flex-1 truncate rounded-md bg-[rgb(var(--console-ink)/0.05)] px-3 py-2 font-mono text-[11.5px] text-[var(--ink-75)]">
							{inviteUrl}
						</p>
						<button
							type="button"
							onClick={() => {
								void navigator.clipboard.writeText(inviteUrl);
								setCopied(true);
							}}
							className={quietAction}
						>
							{copied ? "Copied" : "Copy"}
						</button>
						<button
							type="button"
							onClick={() => setInviteUrl(null)}
							className={quietAction}
						>
							Done
						</button>
					</div>
				</div>
			) : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
				Members
				{members.data ? (
					<span className="text-[var(--ink-25)]">
						{" · "}
						{members.data.items.length}
					</span>
				) : null}
			</p>

			{members.isPending ? (
				<SkeletonRows rows={4} />
			) : members.isError ? (
				<RequestFailure
					error={members.error}
					onRetry={() => {
						void members.refetch();
					}}
				/>
			) : people.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					{needle ? "Nobody matches that." : "Nobody here yet."}
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{people.map((member) => (
						<div
							key={member.userId}
							className="flex flex-wrap items-center gap-4 py-3"
						>
							<span
								aria-hidden="true"
								className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink)/0.07)] text-[11px] text-[var(--ink-50)]"
							>
								{(member.name ?? member.email).trim().charAt(0).toUpperCase()}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12.5px] text-[var(--ink-85)]">
									{member.name ?? member.email}
								</p>
								{member.name ? (
									<p className="truncate text-[11px] text-[var(--ink-30)]">
										{member.email}
									</p>
								) : null}
							</div>
							{member.role === "owner" ? (
								<p className="w-24 shrink-0 text-[11.5px] text-[var(--ink-45)] capitalize">
									{member.role}
								</p>
							) : (
								<div className="w-24 shrink-0">
									<RoleSelect
										value={member.role}
										disabled={changeRole.isPending}
										onChange={(next) => {
											if (next === member.role) return;
											changeRole.mutate({ userId: member.userId, role: next });
										}}
										compact
									/>
								</div>
							)}
							<p className="w-28 shrink-0 text-[11px] text-[var(--ink-30)]">
								{joined(member.joinedAt)}
							</p>
							{/* 🔴 The owner is deliberately not removable. An organization
							    with no owner has nobody who can manage billing or appoint a
							    replacement, and there is no way back from it — the server
							    refuses it too, so this is the honest version of that rule
							    rather than a second implementation of it. */}
							{member.role === "owner" ? (
								<span className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-25)]">
									owner
								</span>
							) : confirmRemove === member.userId ? (
								<span className="flex shrink-0 items-center gap-1.5">
									<button
										type="button"
										disabled={remove.isPending}
										onClick={() => remove.mutate(member.userId)}
										className={dangerAction}
									>
										{remove.isPending ? "Removing…" : "Confirm"}
									</button>
									<button
										type="button"
										onClick={() => setConfirmRemove(null)}
										className={quietAction}
									>
										Cancel
									</button>
								</span>
							) : (
								<button
									type="button"
									onClick={() => {
										setFailure(null);
										setConfirmRemove(member.userId);
									}}
									className={quietAction}
								>
									Remove
								</button>
							)}
						</div>
					))}
				</div>
			)}

			{planLimit ? (
				<PlanLimitDialog
					message={planLimit}
					accountUrl=""
					onClose={() => setPlanLimit(null)}
				/>
			) : null}
		</main>
	);
}

export const Route = createFileRoute("/team")({ component: TeamPage });
