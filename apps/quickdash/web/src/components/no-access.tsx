import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { sessionApi } from "../lib/api";
import { quickDashQueries } from "../lib/quickdash-api";
import { ErrorCard } from "./outlet-error";

/**
 * You are signed in, and this is not yours to open.
 *
 * ── Why this is not a modal ──────────────────────────────────────────────────
 *
 * A dialog says "acknowledge this and carry on with what is behind it". There
 * is nothing behind it — the page never loaded — and a dialog traps focus,
 * which is hostile when the only sane action is to leave. A page you cannot
 * open is a page-shaped answer.
 *
 * ⚠️ A dialog IS right for a 403 on an ACTION: you pressed Delete and your role
 * cannot. There the page behind is still valid and dismissing returns you to
 * real work. That case is not built yet.
 *
 * ── Why it names people ──────────────────────────────────────────────────────
 *
 * 🔴 "Your account does not have permission" with a Go back button is a dead
 * end dressed as an explanation. Nothing the reader can do changes it — the one
 * useful fact is WHO can, and the console already knows: the organisation's
 * owners and admins are a list we can read.
 *
 * ⚠️ Degrades silently. If the members call fails — including with another 403 —
 * the card simply says less rather than reporting a second failure on top of
 * the first. Two error messages for one refusal is worse than one.
 */

type Member = { id: string; name: string | null; email: string; role: string };

/** Roles that can actually change somebody's access. */
const CAN_GRANT = new Set(["owner", "admin"]);

export function NoAccess({
	detail,
	action,
}: {
	detail: string;
	action: React.ReactNode;
}) {
	const routeContext = useRouteContext({ strict: false }) as {
		workspaceId?: string;
	};
	const workspaceId = routeContext?.workspaceId;
	const context = useQuery({
		...quickDashQueries.context(workspaceId ?? ""),
		enabled: Boolean(workspaceId),
	});
	const organizationId = context.data?.workspace.organizationId;

	const members = useQuery({
		queryKey: ["quickdash", "members", organizationId],
		queryFn: async () =>
			(
				await sessionApi.request<{ items: Member[] }>(
					`/account/members?organizationId=${encodeURIComponent(
						organizationId ?? "",
					)}`,
				)
			).data,
		enabled: Boolean(organizationId),
		// One refusal is enough. Retrying a list we may also be refused just
		// spends requests to produce the same silence.
		retry: false,
	});

	const admins = (members.data?.items ?? []).filter((member) =>
		CAN_GRANT.has(member.role.toLowerCase()),
	);

	return (
		<ErrorCard title="You don't have access" detail={detail} action={action}>
			{admins.length > 0 ? (
				<div className="mt-4">
					<p className="text-[10px] text-[var(--ink-25)] uppercase tracking-[0.1em]">
						{admins.length === 1 ? "Ask" : "Ask one of"}
					</p>
					<ul className="mt-1.5 flex flex-col gap-1">
						{admins.slice(0, 3).map((member) => (
							<li key={member.id}>
								{/* A mailto rather than a copyable string: asking is the
								    action, so make asking the thing you can press. */}
								<a
									href={`mailto:${member.email}`}
									className="flex items-center justify-between gap-3 rounded-md bg-[rgb(var(--console-ink)/0.035)] px-2.5 py-1.5 no-underline transition-colors hover:bg-[rgb(var(--console-ink)/0.06)]"
								>
									<span className="min-w-0 truncate text-[12px] text-[var(--ink-75)]">
										{member.name || member.email}
									</span>
									<span className="shrink-0 text-[10.5px] text-[var(--ink-25)] capitalize">
										{member.role}
									</span>
								</a>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</ErrorCard>
	);
}
