import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { sessionApi } from "../../lib/api";
import { FailureStatusLine, WriteFailure } from "../page-state";
import { Group, Row } from "./controls";

/**
 * Turning capabilities on and off, without leaving the workspace.
 *
 * 🔴 `GET /account/workspaces/:id/modules` and `PUT .../modules/:moduleId` have
 * existed all along and were reachable only from the Account app — so changing
 * what a workspace can do meant leaving it, finding it in a list of workspaces,
 * changing it, and coming back.
 *
 * ⚠️ Dependencies are enforced by the API, not here. Orders needs Client
 * records, and the server refuses to remove one that something else is using —
 * the refusal is shown rather than predicted, because the rule lives with the
 * registry and a second copy here would disagree with it eventually.
 */

type ModuleRow = {
	id: string;
	name: string;
	description: string;
	enabled: boolean;
};

export function WorkspaceModules({
	workspaceId,
	organizationId,
}: {
	workspaceId: string;
	/**
	 * 🔴 Required, and easy to miss. These are ACCOUNT routes, and the account
	 * authorizer resolves which organization you are acting in from
	 * `?organizationId=` — there is no implicit "current" one, because a person
	 * can belong to several. Without it every call is a 400 that reads as the
	 * section being broken.
	 */
	organizationId: string | null | undefined;
}) {
	const queryClient = useQueryClient();
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [pending, setPending] = useState<string | null>(null);

	const org = encodeURIComponent(organizationId ?? "");
	const modules = useQuery({
		queryKey: ["quickdash", workspaceId, "module-catalog", organizationId],
		queryFn: async () =>
			(
				await sessionApi.request<{ items: ModuleRow[] }>(
					`/account/workspaces/${workspaceId}/modules?organizationId=${org}`,
				)
			).data,
		enabled: Boolean(organizationId),
	});

	const toggle = useMutation({
		mutationFn: async (input: { moduleId: string; enabled: boolean }) => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}/modules/${input.moduleId}?organizationId=${org}`,
				{ method: "PUT", body: { enabled: input.enabled } },
			);
		},
		onMutate: (input) => {
			setFailure(null);
			setPending(input.moduleId);
		},
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That module could not be changed.",
			}),
		onSettled: async () => {
			setPending(null);
			// Both: the catalog drives this list, the context drives the sidebar.
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["quickdash", workspaceId, "module-catalog"],
				}),
				queryClient.invalidateQueries({
					queryKey: ["quickdash", workspaceId, "context"],
				}),
			]);
		},
	});

	if (modules.isPending) {
		return <p className="text-[12px] text-[var(--ink-30)]">Loading…</p>;
	}

	/**
	 * 🔴 Say so. A failed read used to fall through to an empty list, which
	 * renders as a section with a sentence and nothing under it — identical to a
	 * workspace that genuinely has no modules, and impossible to tell apart.
	 */
	if (modules.isError) {
		return (
			<FailureStatusLine
				error={modules.error}
				onRetry={() => void modules.refetch()}
			/>
		);
	}

	const items = modules.data?.items ?? [];

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				What this workspace can do. Turning one on adds its pages to the sidebar
				and its settings above; turning one off hides them and keeps the
				records.
			</p>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			{items.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					No modules came back for this workspace.
				</p>
			) : null}

			<Group title="Capabilities">
				{items.map((module) => (
					<Row
						key={module.id}
						label={module.name}
						description={module.description}
					>
						<button
							type="button"
							role="switch"
							aria-checked={module.enabled}
							aria-label={`${module.name}: ${module.enabled ? "on" : "off"}`}
							disabled={pending === module.id}
							onClick={() =>
								toggle.mutate({
									moduleId: module.id,
									enabled: !module.enabled,
								})
							}
							className={`relative flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 ${
								module.enabled
									? "bg-[rgb(var(--console-ink))]"
									: "bg-[rgb(var(--console-ink)/0.14)]"
							}`}
						>
							<span
								aria-hidden="true"
								className={`size-4 rounded-full bg-[var(--console-pop)] shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform ${
									module.enabled ? "translate-x-4" : "translate-x-0"
								}`}
							/>
						</button>
					</Row>
				))}
			</Group>
		</div>
	);
}

/**
 * Putting a workspace beyond use, or removing it entirely.
 *
 * 🔴 Two different acts, deliberately separated. Archiving is reversible and
 * hides a workspace somebody has finished with; deleting is not, and takes the
 * orders, customers and payments with it. A single "remove" control that did
 * either depending on a checkbox is how the wrong one gets pressed.
 */
export function WorkspaceDanger({
	workspaceId,
	name,
	accountUrl,
	organizationId,
}: {
	workspaceId: string;
	name: string;
	accountUrl: string;
	/** Same account boundary as the module list — see the note above. */
	organizationId: string | null | undefined;
}) {
	const org = encodeURIComponent(organizationId ?? "");
	const [confirm, setConfirm] = useState("");
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);

	const archive = useMutation({
		mutationFn: async () => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}/archive?organizationId=${org}`,
				{
					method: "POST",
					body: { archived: true },
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That could not be archived." }),
		// 🔑 Leave, rather than invalidate. The workspace you are standing in no
		// longer opens, so staying on it would show a console for something that
		// is closed.
		onSuccess: () => {
			window.location.href = `${accountUrl}/workspaces`;
		},
	});

	const destroy = useMutation({
		mutationFn: async () => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}?organizationId=${org}`,
				{ method: "DELETE" },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That could not be deleted." }),
		onSuccess: () => {
			window.location.href = `${accountUrl}/workspaces`;
		},
	});

	return (
		<div className="flex flex-col gap-5">
			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<div className="rounded-xl border border-[var(--console-line)] p-4">
				<p className="text-[12.5px] text-[var(--ink-85)]">Archive</p>
				<p className="mt-1 text-[11.5px] text-[var(--ink-35)] leading-5">
					Closes this workspace and hides it from the switcher. Nothing is
					deleted and it can be brought back from Account.
				</p>
				<button
					type="button"
					disabled={archive.isPending}
					onClick={() => archive.mutate()}
					className="mt-3 flex h-8 shrink-0 items-center rounded-md border border-[var(--console-line-strong)] px-3 text-[12px] text-[var(--ink-70)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40"
				>
					{archive.isPending ? "Archiving…" : "Archive workspace"}
				</button>
			</div>

			<div className="rounded-xl border border-[var(--signal-failure)]/25 p-4">
				<p className="text-[12.5px] text-[var(--signal-failure-text)]">
					Delete
				</p>
				<p className="mt-1 text-[11.5px] text-[var(--ink-35)] leading-5">
					Removes this workspace and everything in it — products, customers,
					orders and payments. This cannot be undone.
				</p>
				{/* ⚠️ Typing the NAME, not a checkbox. The point is to make somebody
				    read which workspace they are standing in before it goes. */}
				<label className="mt-3 block">
					<span className="mb-1 block text-[11px] text-[var(--ink-35)]">
						Type <span className="text-[var(--ink-70)]">{name}</span> to confirm
					</span>
					<input
						value={confirm}
						onChange={(event) => setConfirm(event.target.value)}
						className="h-9 w-full rounded-md border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none"
					/>
				</label>
				<button
					type="button"
					disabled={confirm.trim() !== name || destroy.isPending}
					onClick={() => destroy.mutate()}
					className="mt-3 flex h-8 shrink-0 items-center rounded-md border border-[var(--signal-failure)]/30 px-3 text-[var(--signal-failure-text)] text-[12px] transition-colors hover:bg-[var(--signal-failure)]/[0.08] disabled:opacity-40"
				>
					{destroy.isPending ? "Deleting…" : "Delete this workspace"}
				</button>
			</div>
		</div>
	);
}
