import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import {
	accountQueries,
	type OrganizationRole,
	useActiveOrganization,
} from "../lib/account-api";
import { api } from "../lib/api";

/**
 * Roles — what people in this organization are allowed to do.
 *
 * 🔑 **A role is a name plus a list of permissions, and only the list means
 * anything.** Nothing in the product branches on a role's name, so call one
 * whatever fits the business — Bookkeeper, Fulfillment, Front of house — and the
 * permissions decide what it can reach.
 *
 * The three built-in roles live in code and cannot be redefined here, so they are
 * shown for reference and nothing more.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const dangerAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--signal-failure)]/25 px-3 text-[11px] text-[var(--signal-failure-text)] outline-none transition-colors hover:bg-[var(--signal-failure)]/[0.08] focus-visible:bg-[var(--signal-failure)]/[0.08] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 w-full rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

/** The built-ins, described in the words somebody hiring for the job would use. */
const BUILT_IN = [
	{
		name: "Owner",
		detail: "Everything, including billing and deleting the organization.",
	},
	{ name: "Admin", detail: "Manages people, workspaces and settings." },
	{ name: "Member", detail: "Works in the workspaces. No billing, no people." },
] as const;

/** `records.write` → `Records · write`. The prefix is the area, the suffix is
 * the depth, and both matter when you are deciding whether to tick it. */
const capabilityLabel = (capability: string) => {
	const [area, action] = capability.split(".");
	const readable = (area ?? capability).replace(/[-_]/g, " ");
	return {
		area: readable.charAt(0).toUpperCase() + readable.slice(1),
		action: (action ?? "").replace(/[-_]/g, " "),
	};
};

function RolesPage() {
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const queryClient = useQueryClient();
	const roles = useQuery(accountQueries.roles(organizationId));
	const capabilities = useQuery(accountQueries.capabilities(organizationId));

	const [editing, setEditing] = useState<OrganizationRole | "new" | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["account", organizationId, "roles"],
		});

	const close = () => {
		setEditing(null);
		setName("");
		setDescription("");
		setSelected([]);
	};

	const open = (role: OrganizationRole | "new") => {
		setFailure(null);
		setEditing(role);
		setName(role === "new" ? "" : role.name);
		setDescription(role === "new" ? "" : (role.description ?? ""));
		setSelected(role === "new" ? [] : role.capabilities);
	};

	const save = useMutation({
		mutationFn: async () => {
			const body = {
				name: name.trim(),
				description: description.trim() || null,
				capabilities: selected,
			};
			return editing === "new"
				? api.request(
						`/account/roles?organizationId=${encodeURIComponent(organizationId)}`,
						{ method: "POST", body },
					)
				: api.request(
						`/account/roles/${(editing as OrganizationRole).id}?organizationId=${encodeURIComponent(organizationId)}`,
						{ method: "PATCH", body },
					);
		},
		onSuccess: () => {
			close();
			void refresh();
		},
		// The server refuses a built-in name, a duplicate, and any permission the
		// caller does not hold themselves. Each of those is worth reading.
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That role could not be saved."),
	});

	const remove = useMutation({
		mutationFn: async (id: string) =>
			api.request(
				`/account/roles/${id}?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "DELETE" },
			),
		onSuccess: () => {
			setConfirmDelete(null);
			void refresh();
		},
		onError: (error: { message?: string }) => {
			setConfirmDelete(null);
			setFailure(error?.message ?? "That role could not be deleted.");
		},
	});

	const toggle = (capability: string) =>
		setSelected((current) =>
			current.includes(capability)
				? current.filter((value) => value !== capability)
				: [...current, capability],
		);

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-5 flex items-center justify-between gap-4">
				<p className="max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
					A role is a name and a set of permissions. Nothing in the product
					reads the name, so call it whatever the job is called here.
				</p>
				<button
					type="button"
					onClick={() => open("new")}
					className={primaryAction}
				>
					<PlusIcon size={13} />
					New role
				</button>
			</div>

			{failure ? (
				<p className="mb-4 text-[12px] text-[var(--signal-failure-text)]">
					{failure}
				</p>
			) : null}

			{editing ? (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim()) save.mutate();
					}}
					className="mb-8 rounded-lg border border-[var(--console-line-strong)] p-4"
				>
					<div className="flex flex-col gap-3 sm:flex-row">
						<div className="min-w-0 flex-1">
							<label
								htmlFor="role-name"
								className="mb-1.5 block text-[11px] text-[var(--ink-40)]"
							>
								Name
							</label>
							<input
								id="role-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Bookkeeper"
								className={field}
							/>
						</div>
						<div className="min-w-0 flex-[2]">
							<label
								htmlFor="role-description"
								className="mb-1.5 block text-[11px] text-[var(--ink-40)]"
							>
								What this role is for
							</label>
							<input
								id="role-description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Reconciles invoices and payments."
								className={field}
							/>
						</div>
					</div>

					<p className="mt-5 mb-2 text-[11px] text-[var(--ink-40)]">
						Permissions
						<span className="text-[var(--ink-25)]">
							{" · "}
							{selected.length} of {capabilities.data?.items.length ?? 0}
						</span>
					</p>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(0,16rem))] justify-start gap-1">
						{(capabilities.data?.items ?? []).map((capability) => {
							const { area, action } = capabilityLabel(capability);
							const on = selected.includes(capability);
							return (
								<button
									key={capability}
									type="button"
									aria-pressed={on}
									onClick={() => toggle(capability)}
									className={`flex items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors ${
										on
											? "bg-[rgb(var(--console-ink)/0.07)]"
											: "hover:bg-[rgb(var(--console-ink)/0.035)]"
									}`}
								>
									<span
										className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
											on
												? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
												: "border-[var(--console-line-strong)]"
										}`}
									>
										{on ? <CheckIcon size={10} weight="bold" /> : null}
									</span>
									<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-75)]">
										{area}
										{action ? (
											<span className="text-[var(--ink-35)]"> · {action}</span>
										) : null}
									</span>
								</button>
							);
						})}
					</div>

					<div className="mt-5 flex items-center gap-2">
						<button
							type="submit"
							disabled={!name.trim() || save.isPending}
							className={`${primaryAction} ${save.isPending ? "shimmer-busy" : ""}`}
						>
							{save.isPending
								? "Saving…"
								: editing === "new"
									? "Create role"
									: "Save changes"}
						</button>
						<button type="button" onClick={close} className={quietAction}>
							Cancel
						</button>
					</div>
				</form>
			) : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Custom roles</p>
			{roles.isPending ? (
				<SkeletonRows rows={4} />
			) : roles.isError ? (
				<RequestFailure
					error={roles.error}
					onRetry={() => {
						void roles.refetch();
					}}
				/>
			) : roles.data.items.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					No custom roles yet. The three built-in ones below cover most
					organizations until somebody needs narrower access.
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{roles.data.items.map((role) => (
						<div
							key={role.id}
							className="flex flex-wrap items-center gap-4 py-3"
						>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12.5px] text-[var(--ink-85)]">
									{role.name}
								</p>
								<p className="truncate text-[11px] text-[var(--ink-30)]">
									{role.description ??
										`${role.capabilities.length} permission${
											role.capabilities.length === 1 ? "" : "s"
										}`}
								</p>
							</div>
							<p className="w-28 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
								{role.capabilities.length} permission
								{role.capabilities.length === 1 ? "" : "s"}
							</p>
							{confirmDelete === role.id ? (
								<span className="flex shrink-0 items-center gap-1.5">
									<button
										type="button"
										disabled={remove.isPending}
										onClick={() => remove.mutate(role.id)}
										className={dangerAction}
									>
										{remove.isPending ? "Deleting…" : "Confirm"}
									</button>
									<button
										type="button"
										onClick={() => setConfirmDelete(null)}
										className={quietAction}
									>
										Cancel
									</button>
								</span>
							) : (
								<span className="flex shrink-0 items-center gap-1.5">
									<button
										type="button"
										onClick={() => open(role)}
										className={quietAction}
									>
										Edit
									</button>
									<button
										type="button"
										onClick={() => {
											setFailure(null);
											setConfirmDelete(role.id);
										}}
										className={quietAction}
									>
										Delete
									</button>
								</span>
							)}
						</div>
					))}
				</div>
			)}

			{/* 🔴 Shown, never editable. These three live in code — a custom role
			    taking one of their names would shadow it, and an organization could
			    quietly strip its own billing access. */}
			<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">Built in</p>
			<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
				{BUILT_IN.map((role) => (
					<div key={role.name} className="flex items-baseline gap-4 py-3">
						<p className="w-24 shrink-0 text-[12.5px] text-[var(--ink-60)]">
							{role.name}
						</p>
						<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-30)]">
							{role.detail}
						</p>
					</div>
				))}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/roles")({ component: RolesPage });
