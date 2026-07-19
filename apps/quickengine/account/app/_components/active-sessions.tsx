"use client";

import { authClient, useSession } from "@quickengine/auth/client";
import { useCallback, useEffect, useState } from "react";

const subtleBtn =
	"rounded-lg border border-foreground/15 px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-foreground/5 disabled:opacity-50";

type SessionRow = {
	id: string;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	updatedAt: string | Date;
};

// Rough, friendly device label from a user-agent string (best-effort, never trusted).
function deviceLabel(userAgent?: string | null): string {
	if (!userAgent) return "Unknown device";
	const os = /Mac OS X|Macintosh/.test(userAgent)
		? "macOS"
		: /Windows/.test(userAgent)
			? "Windows"
			: /Android/.test(userAgent)
				? "Android"
				: /iPhone|iPad|iOS/.test(userAgent)
					? "iOS"
					: /Linux/.test(userAgent)
						? "Linux"
						: "Unknown OS";
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /Chrome\//.test(userAgent)
			? "Chrome"
			: /Firefox\//.test(userAgent)
				? "Firefox"
				: /Safari\//.test(userAgent)
					? "Safari"
					: "Browser";
	return `${browser} on ${os}`;
}

function when(value: string | Date): string {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(value));
}

// Settings → Security: the devices signed in to this account. Uses the auth client's base
// session methods (the auth app is the identity authority). Revoking a session signs that
// device out on its next request.
export function ActiveSessions() {
	const { data: current } = useSession();
	const currentToken = current?.session?.token;
	const [sessions, setSessions] = useState<SessionRow[]>([]);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	const load = useCallback(async () => {
		const res = await authClient.listSessions();
		if (res.data) {
			setSessions(res.data as SessionRow[]);
		} else {
			setError("Couldn't load your sessions.");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function revoke(token: string) {
		setPending(true);
		setError("");
		const res = await authClient.revokeSession({ token });
		setPending(false);
		if (res.error) {
			setError("Couldn't revoke that session.");
			return;
		}
		await load();
	}

	async function revokeOthers() {
		setPending(true);
		setError("");
		const res = await authClient.revokeOtherSessions();
		setPending(false);
		if (res.error) {
			setError("Couldn't sign out the other sessions.");
			return;
		}
		await load();
	}

	return (
		<div className="flex max-w-md flex-col gap-4">
			<div>
				<h3 className="font-medium text-foreground text-sm">Active sessions</h3>
				<p className="mt-1 text-muted-foreground text-xs">
					Devices currently signed in to your account.
				</p>
			</div>

			<ul className="divide-y divide-foreground/[0.06] rounded-xl border border-foreground/[0.06]">
				{sessions.map((s) => {
					const isCurrent = s.token === currentToken;
					return (
						<li
							key={s.id}
							className="flex items-center justify-between gap-3 px-4 py-3"
						>
							<div className="min-w-0">
								<p className="text-foreground text-sm">
									{deviceLabel(s.userAgent)}
									{isCurrent && (
										<span className="ml-2 rounded-full bg-foreground/10 px-2 py-0.5 text-[11px]">
											This device
										</span>
									)}
								</p>
								<p className="mt-0.5 text-muted-foreground text-xs">
									{s.ipAddress ?? "unknown IP"} · {when(s.updatedAt)}
								</p>
							</div>
							{!isCurrent && (
								<button
									type="button"
									className={subtleBtn}
									disabled={pending}
									onClick={() => revoke(s.token)}
								>
									Revoke
								</button>
							)}
						</li>
					);
				})}
			</ul>

			{sessions.length > 1 && (
				<button
					type="button"
					className={`${subtleBtn} w-fit`}
					disabled={pending}
					onClick={revokeOthers}
				>
					Sign out all other sessions
				</button>
			)}
			{error && (
				<p role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
