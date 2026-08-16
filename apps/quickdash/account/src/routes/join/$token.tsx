import { useSession } from "@quickengine/auth/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { clientEnv } from "../../lib/env";

/**
 * Accepting an invitation.
 *
 * 🔑 The page has to answer three questions before anybody presses a button:
 * **who invited me, to what, and as what**. An unexplained "Join organization"
 * with an Accept button is indistinguishable from a phishing page, and the
 * endpoint already returns every one of those facts.
 *
 * 🔴 There is deliberately no Decline. Nothing in the API declines an
 * invitation — only an admin can revoke one — so a Decline button would either
 * lie or need a server change nobody asked for. Ignoring it is the honest
 * alternative, and it is stated.
 */

const primaryAction =
	"inline-flex h-9 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const ROLE_MEANING: Readonly<Record<string, string>> = {
	owner: "Everything, including billing and deleting the organization.",
	admin: "Manages people, workspaces and settings.",
	member: "Works in the workspaces. No billing, no people.",
};

function JoinPage() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const { data: session } = useSession();

	const invitation = useQuery({
		queryKey: ["account", "invitation", token],
		queryFn: async () =>
			(
				await api.request<{
					email: string;
					role: string;
					organizationName?: string;
					invitedByName?: string | null;
					expiresAt?: string;
				}>(`/account/invitations/${token}`)
			).data,
		retry: false,
	});

	const accept = useMutation({
		mutationFn: () =>
			api.request(`/account/invitations/${token}/accept`, { method: "POST" }),
		onSuccess: () => navigate({ to: "/" }),
	});

	const card =
		"w-full max-w-sm rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-panel)] p-5";

	return (
		<main className="flex min-h-svh items-center justify-center bg-[var(--console-bg)] px-5 py-16 text-[var(--ink-90)]">
			{invitation.isPending ? (
				<p className="text-[12px] text-[var(--ink-30)]">Checking invitation…</p>
			) : invitation.isError ? (
				<div className={card}>
					<p className="text-[13px] text-[var(--ink-85)]">
						This invitation is no longer valid
					</p>
					{/* 🔴 Expired, already used and never-existed are deliberately
					    indistinguishable from out here — otherwise this page is a way to
					    test whether a token is real. */}
					<p className="mt-2 text-[11.5px] text-[var(--ink-35)] leading-5">
						It may have been used already, withdrawn, or simply run out of time.
						Ask whoever invited you to send another.
					</p>
					<a href={clientEnv.WEB_URL} className={`${primaryAction} mt-4`}>
						Go to QuickEngine
					</a>
				</div>
			) : (
				<div className={card}>
					<p className="text-[11px] text-[var(--ink-30)]">
						{invitation.data.invitedByName
							? `${invitation.data.invitedByName} invited you to`
							: "You have been invited to"}
					</p>
					<p className="mt-1 text-[17px] text-[var(--ink-90)]">
						{invitation.data.organizationName ?? "an organization"}
					</p>

					<div className="mt-4 divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-y">
						<div className="flex items-baseline gap-3 py-2.5">
							<p className="w-16 shrink-0 text-[11px] text-[var(--ink-30)]">
								As
							</p>
							<p className="min-w-0 flex-1 text-[12px] text-[var(--ink-85)] capitalize">
								{invitation.data.role}
								<span className="mt-0.5 block text-[11px] text-[var(--ink-30)] normal-case leading-4">
									{ROLE_MEANING[invitation.data.role.toLowerCase()] ??
										"A role this organization defined."}
								</span>
							</p>
						</div>
						<div className="flex items-baseline gap-3 py-2.5">
							<p className="w-16 shrink-0 text-[11px] text-[var(--ink-30)]">
								Sent to
							</p>
							<p className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-75)]">
								{invitation.data.email}
							</p>
						</div>
					</div>

					{/* ⚠️ Accepting joins the account you are signed in as, which is not
					    necessarily the address the invitation was sent to. Saying so
					    beforehand avoids somebody joining with the wrong identity and
					    having no way to undo it. */}
					{session?.user?.email &&
					session.user.email.toLowerCase() !==
						invitation.data.email.toLowerCase() ? (
						<p className="mt-3 text-[11px] text-[#f5b44a] leading-4">
							You are signed in as {session.user.email}. Accepting will add that
							account, not {invitation.data.email}.
						</p>
					) : null}

					<button
						type="button"
						onClick={() => accept.mutate()}
						disabled={accept.isPending}
						className={`${primaryAction} mt-4`}
					>
						{accept.isPending ? "Joining…" : "Accept invitation"}
					</button>

					{accept.isError ? (
						<p className="mt-3 text-[11.5px] text-[#ff6b6b] leading-4">
							{(accept.error as { message?: string })?.message ??
								"That could not be accepted."}
						</p>
					) : null}

					<p className="mt-3 text-[11px] text-[var(--ink-25)] leading-4">
						Not expecting this? Ignore it — the invitation expires on its own
						and nothing is shared until you accept.
					</p>
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/join/$token")({ component: JoinPage });
