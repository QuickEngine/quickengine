import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { inlineFailure } from "./page-state";
import { useToast } from "./toast";

/**
 * Deleting a set of ticked rows.
 *
 * 🔴 One at a time, in sequence, and it reports what happened.
 *
 * There is no bulk-delete endpoint anywhere in the API, and inventing one on
 * the client by firing forty parallel requests is how you rate-limit yourself
 * and lose track of which ones landed. Sequential is slower and knowable: if
 * row nineteen refuses because something references it, the eighteen before it
 * are gone, the rest are not, and the count says so.
 *
 * ⚠️ Confirms first, naming the number. "Delete" on a list you have just
 * ticked is the single easiest place in a console to lose work.
 */
export function BulkDelete<TRow extends { id: string }>({
	workspaceId,
	rows,
	/** Resource path, e.g. `/catalog` — the id is appended. */
	path,
	/** What these are, for the confirmation: "products", "customers". */
	noun,
	/** Query keys to refresh once it is done. */
	invalidate,
}: {
	workspaceId: string;
	rows: TRow[];
	path: string;
	noun: string;
	invalidate: readonly unknown[];
}) {
	const queryClient = useQueryClient();
	const toast = useToast();
	const [confirming, setConfirming] = useState(false);
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

	/**
	 * 🔴 Progress, because this is NOT one request.
	 *
	 * Rows are deleted one at a time and deliberately so — a refusal halfway
	 * through leaves the earlier ones gone. "Deleting…" for eleven seconds
	 * tells somebody nothing about how much of that has already happened, and
	 * the one question during a destructive run is exactly that. If it stops on
	 * row seven, the count is what says seven went.
	 */
	const [done, setDone] = useState(0);

	const remove = useMutation({
		mutationFn: async () => {
			let removed = 0;
			for (const row of rows) {
				try {
					await workspaceApi(workspaceId).request(`${path}/${row.id}`, {
						method: "DELETE",
					});
					removed += 1;
				} catch (error) {
					// 🔑 Stop at the first refusal rather than ploughing on. A refusal
					// usually means something still references it, and the next
					// nineteen will refuse for the same reason — forty identical
					// errors tell you nothing the first one did not.
					const message =
						(error as { message?: string })?.message ??
						"Some of those could not be deleted.";
					throw new Error(
						removed > 0 ? `${removed} deleted, then: ${message}` : message,
					);
				}
			}
		},
		onMutate: () => {
			setDone(0);
			setFailure(null);
		},
		/**
		 * 🔑 The one place a toast earns its keep here.
		 *
		 * On success the ticked rows vanish, the selection bar vanishes with
		 * them, and nothing on screen says how many went. Deleting eleven things
		 * and being shown a slightly shorter list is not confirmation — you
		 * cannot tell it from having deleted eight. The failure path stays
		 * INLINE, on the button, because that is where you are looking and
		 * because it must not time out.
		 */
		onSuccess: () =>
			toast.show({
				signal: "success",
				title: `${rows.length} ${rows.length === 1 ? noun.replace(/s$/, "") : noun} deleted`,
			}),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "Those could not be deleted." }),
		onSettled: async () => {
			setConfirming(false);
			await queryClient.invalidateQueries({ queryKey: invalidate });
		},
	});

	if (failure) {
		/**
		 * ⚠️ The one place a failure is a BUTTON rather than a card.
		 *
		 * It lives in the selection strip — a 28px row beside Export and the
		 * count — where a card would push the controls off the line somebody is
		 * mid-way through using. So it stays compact, keeps a border and a tone
		 * so it is never bare text on the background, carries the full sentence
		 * in its title, and clears when pressed.
		 *
		 * 🔑 The words come from `presentRequestError`, so a 500 here says the
		 * same thing a 500 says anywhere else instead of leaking `HTTP 500`.
		 */
		const said = failure.error
			? inlineFailure(failure.error)
			: failure.fallback;
		return (
			<button
				type="button"
				onClick={() => setFailure(null)}
				data-hint={said}
				className="control-raised flex h-7 shrink-0 items-center rounded-md border border-[var(--signal-failure)]/30 px-2.5 text-[11.5px] text-[var(--signal-failure-text)] outline-none"
			>
				{said.length > 42 ? `${said.slice(0, 42)}…` : said}
			</button>
		);
	}

	return (
		<button
			type="button"
			disabled={remove.isPending}
			onClick={() => (confirming ? remove.mutate() : setConfirming(true))}
			onBlur={() => setConfirming(false)}
			/* 🔴 Two classes, not one, and the difference matters.
			   `.control-raised` paints its own face, which is right for the resting
			   state: a key with red ink on it. `.control-lift` gives the same
			   elevation and the same press WITHOUT touching the background, which is
			   what the armed state needs, because a solid red fill is the whole
			   point of it. Using `.control-raised` there would quietly paint over
			   the red and the confirm step would stop looking dangerous. */
			className={`${remove.isPending ? "shimmer-busy" : ""} flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11.5px] outline-none disabled:opacity-40 ${
				confirming
					? "control-lift border-transparent bg-[var(--signal-failure)] text-white"
					: "control-raised border-[var(--signal-failure)]/30 text-[var(--signal-failure-text)]"
			}`}
		>
			{remove.isPending
				? `Deleting ${done + 1} of ${rows.length}…`
				: confirming
					? `Delete ${rows.length} ${noun}?`
					: "Delete"}
		</button>
	);
}
