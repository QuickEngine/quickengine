import { WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SkeletonRows } from "../../components/skeletons";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import { clientEnv } from "../../lib/env";

/**
 * One workspace, administered.
 *
 * 🔑 Everything here is irreversible in some degree — renaming changes what a
 * team calls a business, disabling a module hides its records, archiving takes
 * it out of QuickDash, deleting destroys it. So each section states what happens
 * BEFORE the control rather than after the refusal.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] disabled:pointer-events-none disabled:opacity-40";

const dangerAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--signal-failure)]/30 px-4 text-[12.5px] text-[var(--signal-failure-text)] outline-none transition-colors hover:bg-[var(--signal-failure)]/[0.08] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 w-72 max-w-full rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

function WorkspaceDetailPage() {
	const { slug } = Route.useParams();
	const navigate = useNavigate();
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const queryClient = useQueryClient();

	const workspaces = useQuery(accountQueries.workspaces(organizationId));
	const catalog = useQuery(accountQueries.moduleCatalog());

	const [name, setName] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const workspace = (workspaces.data?.items ?? []).find(
		(item) => item.slug === slug || item.id === slug,
	);
	const enabled = new Set(workspace?.modules ?? []);
	const archived = Boolean(workspace?.archivedAt);
	const sandbox = workspace?.environment === "test";

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["account", organizationId, "workspaces"],
		});

	const call = (
		path: string,
		init: { method: "PATCH" | "POST" | "PUT" | "DELETE"; body?: unknown },
	) =>
		api.request(
			`/account/workspaces/${workspace?.id}${path}?organizationId=${encodeURIComponent(organizationId)}`,
			init,
		);

	const rename = useMutation({
		mutationFn: async () =>
			call("", { method: "PATCH", body: { name: (name ?? "").trim() } }),
		onSuccess: () => {
			setFailure(null);
			setName(null);
			void refresh();
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That name could not be saved."),
	});

	const setEnvironment = useMutation({
		mutationFn: async (environment: "test" | "live") =>
			call("/environment", { method: "PATCH", body: { environment } }),
		onSuccess: () => {
			setFailure(null);
			void refresh();
		},
		onError: (error: { message?: string }) =>
			setFailure(
				error?.message ??
					"The environment is locked once a workspace has taken payments.",
			),
	});

	const toggleModule = useMutation({
		mutationFn: async (input: { moduleId: string; enabled: boolean }) =>
			call(`/modules/${input.moduleId}`, {
				method: "PUT",
				body: { enabled: input.enabled },
			}),
		onSuccess: () => {
			setFailure(null);
			void refresh();
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That module could not be changed."),
	});

	const setArchived = useMutation({
		mutationFn: async (value: boolean) =>
			call("/archive", { method: "POST", body: { archived: value } }),
		onSuccess: () => {
			setFailure(null);
			void refresh();
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be changed."),
	});

	const destroy = useMutation({
		mutationFn: async () => call("", { method: "DELETE" }),
		onSuccess: () => {
			void refresh();
			void navigate({ to: "/workspaces" });
		},
		onError: (error: { message?: string }) => {
			setConfirmDelete(false);
			setFailure(error?.message ?? "That workspace could not be deleted.");
		},
	});

	if (workspaces.isPending) {
		return (
			<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
				<SkeletonRows rows={4} />
			</main>
		);
	}

	if (!workspace) {
		return (
			<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
				<p className="text-[12.5px] text-[var(--ink-85)]">
					No such workspace here
				</p>
				<p className="mt-1.5 max-w-md text-[11.5px] text-[var(--ink-35)] leading-5">
					It may belong to a different organization, or have been deleted.
				</p>
			</main>
		);
	}

	const currentName = name ?? workspace.name;
	const dirty = currentName.trim() !== workspace.name;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{failure ? (
				<div className="mb-6 flex max-w-2xl items-start gap-2.5 rounded-lg border border-[var(--signal-attention)]/30 bg-[var(--signal-attention)]/[0.06] p-3.5">
					<WarningIcon
						size={14}
						className="mt-0.5 shrink-0 text-[var(--signal-attention-text)]"
						weight="fill"
					/>
					<p className="text-[12px] text-[var(--signal-attention-text)] leading-5">
						{failure}
					</p>
				</div>
			) : null}

			<div className="mb-6 flex flex-wrap items-center gap-3">
				<p className="text-[17px] text-[var(--ink-90)]">{workspace.name}</p>
				{sandbox ? (
					<span className="rounded-[3px] bg-[var(--signal-attention)]/[0.14] px-1.5 py-0.5 font-medium text-[9px] text-[var(--signal-attention-text)] uppercase tracking-[0.09em]">
						Sandbox
					</span>
				) : null}
				{archived ? (
					<span className="rounded-[3px] bg-[rgb(var(--console-ink)/0.07)] px-1.5 py-0.5 font-medium text-[9px] text-[var(--ink-40)] uppercase tracking-[0.09em]">
						Archived
					</span>
				) : null}
				{archived ? null : (
					<a
						href={`${clientEnv.DASH_URL}/${workspace.id}`}
						className={`${quietAction} ml-auto`}
					>
						Open in QuickDash
					</a>
				)}
			</div>

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Name</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (dirty && currentName.trim()) rename.mutate();
				}}
				className="flex max-w-2xl flex-wrap items-center gap-2 border-[var(--console-line-soft)] border-t py-4"
			>
				<input
					value={currentName}
					onChange={(event) => setName(event.target.value)}
					aria-label="Workspace name"
					className={field}
				/>
				<button
					type="submit"
					disabled={!dirty || !currentName.trim() || rename.isPending}
					className={`${primaryAction} ${rename.isPending ? "shimmer-busy" : ""}`}
				>
					{rename.isPending ? "Saving…" : "Save"}
				</button>
				{dirty ? (
					<button
						type="button"
						onClick={() => setName(null)}
						className={quietAction}
					>
						Cancel
					</button>
				) : null}
			</form>

			<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Environment
			</p>
			<div className="max-w-2xl border-[var(--console-line-soft)] border-t py-4">
				<div className="flex flex-wrap items-center gap-4">
					<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-40)] leading-5">
						{sandbox
							? "Sandbox. Payments are not charged and nothing here belongs to a live business."
							: "Live. Payments taken in this workspace are charged."}
					</p>
					<button
						type="button"
						role="switch"
						aria-checked={sandbox}
						aria-label="Environment"
						disabled={setEnvironment.isPending}
						onClick={() => setEnvironment.mutate(sandbox ? "live" : "test")}
						/* 🔑 A switch between two equals — sandbox and live — so it takes a
						   visible track and NEVER an on-colour. Green here would imply one
						   of the two modes is "running" and the other is off, which is
						   exactly the wrong idea about a workspace that is always in one
						   of them. */
						className="relative flex h-9 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] bg-[rgb(var(--console-ink)/0.04)] p-0.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.08)] disabled:opacity-40"
					>
						<span
							aria-hidden="true"
							className={`absolute top-0.5 left-0.5 h-8 w-[4.5rem] rounded-full bg-[var(--console-pop)] shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-out ${sandbox ? "translate-x-[4.5rem]" : "translate-x-0"}`}
						/>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] ${sandbox ? "text-[var(--ink-30)]" : "text-[var(--ink-90)]"}`}
						>
							Live
						</span>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] ${sandbox ? "text-[var(--ink-90)]" : "text-[var(--ink-30)]"}`}
						>
							Sandbox
						</span>
					</button>
				</div>
				<p className="mt-3 text-[11px] text-[var(--ink-30)] leading-5">
					Locks as soon as this workspace connects a payment provider, takes an
					order or receives a payment, switching afterwards would leave real
					money in a workspace labelled sandbox.
				</p>
			</div>

			<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Modules
				<span className="text-[var(--ink-25)]">{` · ${enabled.size} on`}</span>
			</p>
			<div className="max-w-2xl divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
				{(catalog.data?.items ?? [])
					.filter((module) => module.status === "built")
					.map((module) => {
						const on = enabled.has(module.id);
						// 🔴 Shown, because the server resolves dependencies whether or not
						// the UI does. Turning on Shipping brings Orders and Fulfillment
						// with it; hiding that makes the result look like a bug.
						const brings = module.dependsOn.filter((id) => !enabled.has(id));
						return (
							<div key={module.id} className="flex items-center gap-4 py-3">
								<div className="min-w-0 flex-1">
									<p className="text-[12.5px] text-[var(--ink-85)]">
										{module.name}
									</p>
									<p className="mt-0.5 text-[11px] text-[var(--ink-30)] leading-4">
										{module.description}
										{!on && brings.length > 0
											? ` · also enables ${brings.join(", ")}`
											: ""}
									</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={on}
									aria-label={`${module.name} ${on ? "enabled" : "disabled"}`}
									disabled={toggleModule.isPending}
									onClick={() =>
										toggleModule.mutate({ moduleId: module.id, enabled: !on })
									}
									/* 🔴 On is GREEN, off is the surface.
									   Both states were shades of the same ink at low alpha, so a
									   row of switches read as a row of controls with no legible
									   position — you had to look at the knob, not the switch.
									   Colour set inline because the token is a hex, and a Tailwind
									   arbitrary value with an alpha channel would emit no rule. */
									style={on ? { background: "var(--signal-on)" } : undefined}
									className={`relative flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 outline-none transition-colors disabled:opacity-40 ${on ? "" : "bg-[rgb(var(--console-ink)/0.1)]"}`}
								>
									<span
										aria-hidden="true"
										/* ⚠️ White while on, the surface colour while off. The thumb was
										   `--console-pop` in both states, which on a green track is a dark
										   disc on a mid tone — the one element that has to be unmistakable
										   became the least visible thing on the control. */
										style={on ? { background: "#fff" } : undefined}
										className={`size-5 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform duration-200 ${on ? "translate-x-4" : "translate-x-0 bg-[var(--console-pop)]"}`}
									/>
								</button>
							</div>
						);
					})}
			</div>

			<p className="mt-10 mb-1 text-[12.5px] text-[var(--signal-failure-text)]">
				Danger zone
			</p>
			<div className="max-w-2xl divide-y divide-[var(--signal-failure)]/15 border-[var(--signal-failure)]/20 border-t">
				<div className="flex flex-wrap items-center gap-4 py-4">
					<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-40)] leading-5">
						{archived
							? "Archived. It is hidden from QuickDash and its records are untouched."
							: "Archiving hides this workspace from QuickDash. Nothing is deleted and it can be restored."}
					</p>
					<button
						type="button"
						disabled={setArchived.isPending}
						onClick={() => setArchived.mutate(!archived)}
						className={quietAction}
					>
						{archived ? "Restore" : "Archive"}
					</button>
				</div>

				<div className="py-4">
					<p className="max-w-xl text-[11.5px] text-[var(--ink-40)] leading-5">
						Deleting removes this workspace and every record in it, customers,
						orders, payments, files. It cannot be undone.
					</p>
					{confirmDelete ? (
						<div className="mt-3">
							<label
								htmlFor="confirm-delete"
								className="mb-1.5 block text-[11px] text-[var(--ink-40)]"
							>
								Type{" "}
								<span className="text-[var(--ink-75)]">{workspace.name}</span>{" "}
								to confirm
							</label>
							<div className="flex flex-wrap items-center gap-2">
								<input
									id="confirm-delete"
									value={confirmText}
									onChange={(event) => setConfirmText(event.target.value)}
									className={field}
								/>
								<button
									type="button"
									disabled={confirmText !== workspace.name || destroy.isPending}
									onClick={() => destroy.mutate()}
									className={dangerAction}
								>
									{destroy.isPending ? "Deleting…" : "Delete workspace"}
								</button>
								<button
									type="button"
									onClick={() => {
										setConfirmDelete(false);
										setConfirmText("");
									}}
									className={quietAction}
								>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							onClick={() => {
								setFailure(null);
								setConfirmDelete(true);
							}}
							className={`${dangerAction} mt-3`}
						>
							Delete workspace
						</button>
					)}
				</div>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/workspaces/$slug")({
	component: WorkspaceDetailPage,
});
