import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";

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
	const [confirming, setConfirming] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);

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
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "Those could not be deleted."),
		onSettled: async () => {
			setConfirming(false);
			await queryClient.invalidateQueries({ queryKey: invalidate });
		},
	});

	if (failure) {
		return (
			<button
				type="button"
				onClick={() => setFailure(null)}
				title={failure}
				className="flex h-7 shrink-0 items-center rounded-md border border-[#ff3b3b]/30 px-2.5 text-[11.5px] text-[#ff6b6b]"
			>
				{failure.length > 42 ? `${failure.slice(0, 42)}…` : failure}
			</button>
		);
	}

	return (
		<button
			type="button"
			disabled={remove.isPending}
			onClick={() => (confirming ? remove.mutate() : setConfirming(true))}
			onBlur={() => setConfirming(false)}
			className={`flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11.5px] transition-colors disabled:opacity-40 ${
				confirming
					? "border-transparent bg-[#ff3b3b] text-white"
					: "border-[#ff3b3b]/30 text-[#ff6b6b] hover:bg-[#ff3b3b]/[0.08]"
			}`}
		>
			{remove.isPending
				? "Deleting…"
				: confirming
					? `Delete ${rows.length} ${noun}?`
					: "Delete"}
		</button>
	);
}
