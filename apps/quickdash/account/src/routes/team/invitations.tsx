import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../../components/page-state";
import { SkeletonRows } from "../../components/skeletons";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

/**
 * People → Invitations. Everyone who has been asked but has not arrived.
 *
 * 🔴 An invitation is only usable through the email it was sent in — the token
 * is stored hashed, so there is no way to read it back out and re-send it. If it
 * never arrived, the honest remedy is to revoke it and invite again.
 */

const quietAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const expires = (value: string) => {
	const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
	if (days < 0) return "expired";
	if (days === 0) return "expires today";
	return `expires in ${days} day${days === 1 ? "" : "s"}`;
};

const sent = (value: string) =>
	new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
		new Date(value),
	);

function InvitationsPage() {
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const queryClient = useQueryClient();
	const invitations = useQuery(accountQueries.invitations(organizationId));
	const [failure, setFailure] = useState<string | null>(null);

	const revoke = useMutation({
		mutationFn: async (id: string) =>
			api.request(
				`/account/invitations/${id}?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "DELETE" },
			),
		onSuccess: () => {
			setFailure(null);
			void queryClient.invalidateQueries({
				queryKey: ["account", organizationId, "invitations"],
			});
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That invitation could not be revoked."),
	});

	const items = invitations.data?.items ?? [];
	const pending = items.filter((invitation) => invitation.status === "pending");
	const closed = items.filter((invitation) => invitation.status !== "pending");

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{failure ? (
				<p className="mb-4 text-[12px] text-[var(--signal-failure-text)]">
					{failure}
				</p>
			) : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
				Waiting to be accepted
				{pending.length > 0 ? (
					<span className="text-[var(--ink-25)]">{` · ${pending.length}`}</span>
				) : null}
			</p>

			{invitations.isPending ? (
				<SkeletonRows rows={4} />
			) : invitations.isError ? (
				<RequestFailure
					error={invitations.error}
					onRetry={() => {
						void invitations.refetch();
					}}
				/>
			) : pending.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					Nobody is waiting. Invite someone from Members.
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{pending.map((invitation) => (
						<div
							key={invitation.id}
							className="flex flex-wrap items-center gap-4 py-3"
						>
							<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
								{invitation.email}
							</p>
							<p className="w-24 shrink-0 text-[11.5px] text-[var(--ink-45)] capitalize">
								{invitation.role}
							</p>
							<p className="w-32 shrink-0 text-[11px] text-[var(--ink-30)]">
								{expires(invitation.expiresAt)}
							</p>
							<button
								type="button"
								disabled={revoke.isPending}
								onClick={() => revoke.mutate(invitation.id)}
								className={quietAction}
							>
								Revoke
							</button>
						</div>
					))}
				</div>
			)}

			{closed.length > 0 ? (
				<>
					<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
						Finished
					</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{closed.map((invitation) => (
							<div
								key={invitation.id}
								className="flex flex-wrap items-center gap-4 py-3"
							>
								<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-45)]">
									{invitation.email}
								</p>
								<p className="w-24 shrink-0 text-[11.5px] text-[var(--ink-30)] capitalize">
									{invitation.role}
								</p>
								<p className="w-32 shrink-0 text-[11px] text-[var(--ink-30)] capitalize">
									{invitation.status}
								</p>
								<p className="w-20 shrink-0 text-right text-[11px] text-[var(--ink-25)]">
									{sent(invitation.expiresAt)}
								</p>
							</div>
						))}
					</div>
				</>
			) : null}
		</main>
	);
}

export const Route = createFileRoute("/team/invitations")({
	component: InvitationsPage,
});
