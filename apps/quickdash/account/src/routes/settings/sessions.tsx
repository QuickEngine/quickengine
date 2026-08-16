import { authClient, useSession } from "@quickengine/auth/client";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Security → Sessions. Every browser currently signed in as you.
 *
 * 🔑 The point of the page is the one you do not recognise. So the current
 * session is labelled rather than hidden, every other one is revocable
 * individually, and "sign out everywhere else" is one button — because somebody
 * who thinks they have been compromised should not have to work down a list.
 */

const quietAction =
	"inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const dangerAction =
	"inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#ff3b3b]/25 px-3.5 text-[11.5px] text-[#ff6b6b] outline-none transition-colors hover:bg-[#ff3b3b]/[0.08] focus-visible:bg-[#ff3b3b]/[0.08] disabled:pointer-events-none disabled:opacity-40";

type SessionRow = {
	id: string;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	updatedAt: string | Date;
};

/** Best-effort, and never trusted for anything but recognition. */
const deviceLabel = (userAgent?: string | null) => {
	if (!userAgent) return "Unknown device";
	const os = /Mac OS X|Macintosh/.test(userAgent)
		? "macOS"
		: /Windows/.test(userAgent)
			? "Windows"
			: /iPhone|iPad/.test(userAgent)
				? "iOS"
				: /Android/.test(userAgent)
					? "Android"
					: /Linux/.test(userAgent)
						? "Linux"
						: "Unknown OS";
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /OPR\//.test(userAgent)
			? "Opera"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Safari\//.test(userAgent)
					? "Safari"
					: /Firefox\//.test(userAgent)
						? "Firefox"
						: "Unknown browser";
	return `${browser} on ${os}`;
};

const seen = (value: string | Date) => {
	const elapsed = Date.now() - new Date(value).getTime();
	const minutes = Math.round(elapsed / 60_000);
	if (minutes < 2) return "active now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
	}).format(new Date(value));
};

function SessionsPage() {
	const { data: current } = useSession();
	const [failure, setFailure] = useState("");
	const [busy, setBusy] = useState(false);

	const sessions = useQuery({
		queryKey: ["account", "sessions"],
		queryFn: async () => {
			const result = await authClient.listSessions();
			if (result.error) throw new Error(result.error.message ?? "failed");
			return (result.data ?? []) as SessionRow[];
		},
	});

	const revoke = async (token: string) => {
		setBusy(true);
		setFailure("");
		const result = await authClient.revokeSession({ token });
		setBusy(false);
		if (result.error) {
			setFailure("That session could not be revoked.");
			return;
		}
		void sessions.refetch();
	};

	const revokeOthers = async () => {
		setBusy(true);
		setFailure("");
		const result = await authClient.revokeOtherSessions();
		setBusy(false);
		if (result.error) {
			setFailure("Those sessions could not be revoked.");
			return;
		}
		void sessions.refetch();
	};

	const rows = sessions.data ?? [];
	const others = rows.filter(
		(row) => row.token !== current?.session?.token,
	).length;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<p className="max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
					Every browser signed in as you. Revoking one signs it out immediately
					— it does not wait for the session to expire.
				</p>
				{others > 0 ? (
					<button
						type="button"
						disabled={busy}
						onClick={() => void revokeOthers()}
						className={dangerAction}
					>
						Sign out {others} other {others === 1 ? "session" : "sessions"}
					</button>
				) : null}
			</div>

			{failure ? (
				<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
			) : null}

			{sessions.isPending ? (
				<p className="text-[12px] text-[var(--ink-30)]">Loading sessions…</p>
			) : sessions.isError ? (
				<p className="text-[12px] text-[var(--ink-45)]">
					Sessions did not load.
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{rows.map((row) => {
						const isCurrent = row.token === current?.session?.token;
						return (
							<div
								key={row.id}
								className="flex flex-wrap items-center gap-4 py-3"
							>
								<div className="min-w-0 flex-1">
									<p className="flex items-center gap-2 truncate text-[12.5px] text-[var(--ink-85)]">
										{deviceLabel(row.userAgent)}
										{isCurrent ? (
											<span className="shrink-0 rounded-[3px] bg-[rgb(var(--console-ink)/0.07)] px-1.5 py-0.5 font-medium text-[9px] text-[var(--ink-45)] uppercase tracking-[0.09em]">
												This device
											</span>
										) : null}
									</p>
									<p className="mt-0.5 truncate text-[11px] text-[var(--ink-30)]">
										{row.ipAddress ?? "Unknown location"}
									</p>
								</div>
								<p className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
									{seen(row.updatedAt)}
								</p>
								{isCurrent ? (
									<span className="w-16 shrink-0 text-right text-[11px] text-[var(--ink-25)]">
										in use
									</span>
								) : (
									<button
										type="button"
										disabled={busy}
										onClick={() => void revoke(row.token)}
										className={quietAction}
									>
										Revoke
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/settings/sessions")({
	component: SessionsPage,
});
