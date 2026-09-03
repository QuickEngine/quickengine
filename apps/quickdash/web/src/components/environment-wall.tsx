import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { sessionApi } from "../lib/api";
import { quickDashQueries } from "../lib/quickdash-api";
import { GoBack } from "./error-actions";
import { ErrorCard } from "./outlet-error";

/**
 * The workspace is in one mode and the thing you asked for is in the other.
 *
 * ── Why this is its own screen ───────────────────────────────────────────────
 *
 * 🔴 It answered 409, so it was being described as a conflict: "this changed
 * before we could finish, refresh and try again." Nothing changed and nothing
 * is stale, so refreshing does nothing and retrying does nothing — the console
 * was sending somebody round a loop that could not end.
 *
 * 🔑 Every other error's way out is retry, go back, or upgrade. This one's is a
 * SWITCH, and the console already knows which mode it is in and how to change
 * it. That is the whole reason it deserves a kind of its own.
 *
 * ⚠️ Sometimes there is no way out, and that is not a failure of this screen.
 * Once a workspace holds real orders or payments it can never move — test
 * rehearsals and real books must not share one ledger — so the card says so
 * plainly instead of offering a button that would be refused.
 */
export function EnvironmentWall({
	title,
	detail,
}: {
	title: string;
	detail: string;
}) {
	const routeContext = useRouteContext({ strict: false }) as {
		workspaceId?: string;
	};
	const workspaceId = routeContext?.workspaceId;
	const queryClient = useQueryClient();
	const [refused, setRefused] = useState<string | null>(null);

	const context = useQuery({
		...quickDashQueries.context(workspaceId ?? ""),
		enabled: Boolean(workspaceId),
	});
	const workspace = context.data?.workspace;
	const here = workspace?.environment;
	const other = here === "test" ? "live" : "test";

	const switchTo = useMutation({
		mutationFn: () =>
			sessionApi.request(
				`/account/workspaces/${workspaceId}/environment?organizationId=${encodeURIComponent(
					workspace?.organizationId ?? "",
				)}`,
				{ method: "PATCH", body: { environment: other } },
			),
		onSuccess: () => {
			setRefused(null);
			// The whole console is scoped to the mode, so everything it holds is
			// now about the wrong one. Clearing the lot is cheaper than listing
			// which parts were mode-specific and being wrong about one of them.
			void queryClient.invalidateQueries();
		},
		onError: (error: { message?: string }) =>
			setRefused(
				error?.message ??
					"That could not be changed. This workspace has already taken payments.",
			),
	});

	/**
	 * A lock is permanent. Offering "Switch to live" on a workspace that has
	 * taken money is offering a button whose only outcome is a second refusal.
	 */
	const locked = title.includes("locked");

	return (
		<ErrorCard
			title={title}
			detail={detail}
			action={
				<>
					{!locked && here ? (
						<button
							type="button"
							disabled={switchTo.isPending}
							onClick={() => switchTo.mutate()}
							className={`${switchTo.isPending ? "shimmer-busy" : ""} inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90 disabled:opacity-40`}
						>
							{switchTo.isPending
								? "Switching…"
								: `Switch to ${other === "test" ? "sandbox" : "live"}`}
						</button>
					) : null}
					<GoBack />
				</>
			}
		>
			{here ? (
				<p className="mt-4 rounded-md bg-[rgb(var(--console-ink)/0.035)] px-2.5 py-2 text-[11.5px] text-[var(--ink-45)]">
					This workspace is in{" "}
					<span className="text-[var(--ink-80)]">
						{here === "test" ? "sandbox" : "live"}
					</span>{" "}
					mode.
				</p>
			) : null}
			{/* A refused switch is reported HERE rather than replacing the card:
			    the explanation above is still the thing somebody needs to read. */}
			{refused ? (
				<p className="mt-2 text-[11.5px] text-[var(--signal-failure-text)] leading-5">
					{refused}
				</p>
			) : null}
		</ErrorCard>
	);
}
