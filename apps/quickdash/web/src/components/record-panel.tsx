import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { BlockEmpty, BlockFailure, DetailPanel } from "./detail-panel";

/**
 * The shared machinery behind every record's detail panel.
 *
 * 🔴 Nine panels differ in what they SHOW and what they can DO, and in nothing
 * else: each loads one record by id, renders facts about it, and offers a few
 * lifecycle moves. Writing that nine times is nine chances to forget the
 * idempotency key, the loading state, or to invalidate the list afterwards —
 * all of which have already been shipped broken at least once today.
 *
 * So the fetching, the action buttons and the failure line live here, and each
 * panel supplies only the parts that are genuinely its own.
 */

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

export type RecordAction = {
	label: string;
	/** Appended to the record path, e.g. `status` or `accept`. */
	path: string;
	body?: Record<string, unknown>;
	/** Hidden entirely when false — never offer a move the API will refuse. */
	when?: boolean;
};

export function RecordPanel<TRecord extends { id: string }>({
	workspaceId,
	/** The collection path, e.g. `invoices`. Also the query key segment. */
	resource,
	id,
	title,
	subtitle,
	actions,
	onClose,
	children,
}: {
	workspaceId: string;
	resource: string;
	id: string;
	title: (record: TRecord) => string;
	subtitle?: (record: TRecord) => ReactNode;
	actions?: (record: TRecord) => RecordAction[];
	onClose: () => void;
	children: (record: TRecord) => ReactNode;
}) {
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<string | null>(null);

	const record = useQuery({
		queryKey: ["quickdash", workspaceId, resource, id],
		queryFn: async () =>
			(await workspaceApi(workspaceId).request<TRecord>(`/${resource}/${id}`))
				.data,
	});

	const act = useMutation({
		mutationFn: async (action: RecordAction) => {
			await workspaceApi(workspaceId).request(
				`/${resource}/${id}/${action.path}`,
				{
					method: "POST",
					// Every one of these commits through `mutationContext`, which
					// refuses a mutation carrying no key.
					idempotencyKey: crypto.randomUUID(),
					body: action.body ?? {},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not work."),
		onSuccess: async () => {
			// Both the record and the list it came from, or the row behind the panel
			// keeps its old status.
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, resource],
			});
		},
	});

	const data = record.data;

	return (
		<DetailPanel
			title={data ? title(data) : "Loading…"}
			subtitle={data && subtitle ? subtitle(data) : undefined}
			onClose={onClose}
			actions={
				data && actions
					? actions(data)
							.filter((action) => action.when !== false)
							.map((action) => (
								<button
									key={`${action.path}-${action.label}`}
									type="button"
									className={quiet}
									disabled={act.isPending}
									onClick={() => act.mutate(action)}
								>
									{action.label}
								</button>
							))
					: undefined
			}
			footer={
				failure ? (
					<p className="text-[11.5px] text-[var(--signal-failure)]">
						{failure}
					</p>
				) : undefined
			}
		>
			{record.isError ? (
				<BlockFailure query={record} />
			) : record.isPending ? (
				<BlockEmpty>Loading…</BlockEmpty>
			) : record.isError || !data ? (
				<BlockEmpty>That record could not be loaded.</BlockEmpty>
			) : (
				children(data)
			)}
		</DetailPanel>
	);
}
