import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { sessionApi } from "../lib/api";

/**
 * The way out of sandbox, on the banner that says you are in it.
 *
 * 🔑 The switch belongs HERE, next to the statement of which mode you are in.
 * Sending somebody to the account application to change a setting they are
 * currently looking at is the kind of errand that makes a console feel like
 * paperwork.
 *
 * ⚠️ Switching is REFUSED once a workspace holds a connected payment account, an
 * order or a payment, and that refusal is correct — see `setWorkspaceEnvironment`.
 * What was wrong was the answer: "This workspace has entered the payment
 * lifecycle" is not a sentence anybody outside this repository can act on. It
 * now says what happened and what to do instead.
 */
export function GoLive({
	workspaceId,
	organizationId,
	accountUrl,
}: {
	workspaceId: string;
	/**
	 * 🔴 Required. Account routes resolve the caller's organization from this
	 * query parameter, and omitting it made every call fail authorization — which
	 * this component then reported as "you already have orders", a sentence about
	 * an entirely different problem. The switch was never broken; the request
	 * never arrived.
	 */
	organizationId: string | null | undefined;
	accountUrl: string;
}) {
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<{
		locked: boolean;
		message: string;
	} | null>(null);

	const goLive = useMutation({
		mutationFn: async () => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}/environment?organizationId=${encodeURIComponent(organizationId ?? "")}`,
				{ method: "PATCH", body: { environment: "live" } },
			);
		},
		onMutate: () => setFailure(null),
		/**
		 * ⚠️ Only ENVIRONMENT_LOCKED means "this can never work". Everything else
		 * is an ordinary failure and is reported as itself — telling somebody their
		 * workspace is permanently locked when the request merely failed sends them
		 * off to rebuild a workspace they never needed to.
		 */
		onError: (error: { code?: string; message?: string }) =>
			setFailure({
				locked: error?.code === "ENVIRONMENT_LOCKED",
				message: error?.message ?? "That could not be changed just now.",
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quickdash"] }),
	});

	if (failure && !failure.locked) {
		return (
			<span className="flex items-center gap-2 text-[11px]">
				<span className="opacity-90">{failure.message}</span>
				<button
					type="button"
					onClick={() => goLive.mutate()}
					className="shrink-0 underline underline-offset-2"
				>
					Try again
				</button>
			</span>
		);
	}

	if (failure?.locked) {
		return (
			<span className="flex items-center gap-2 text-[11px]">
				<span className="opacity-90">
					This workspace already has orders or payments in it, so it has to stay
					test. Real books and rehearsals cannot share a ledger.
				</span>
				<a
					href={`${accountUrl}/workspaces/new`}
					className="shrink-0 rounded-full bg-[var(--console-banner-ink)] px-2.5 py-1 font-medium text-[10.5px] text-[var(--console-banner)] transition-opacity hover:opacity-85"
				>
					New live workspace
				</a>
			</span>
		);
	}

	return (
		<button
			type="button"
			onClick={() => goLive.mutate()}
			disabled={goLive.isPending}
			className="rounded-full bg-[var(--console-banner-ink)] px-2.5 py-1 font-medium text-[10.5px] text-[var(--console-banner)] transition-opacity hover:opacity-85 disabled:opacity-50"
		>
			{goLive.isPending ? "Switching…" : "Go live"}
		</button>
	);
}
