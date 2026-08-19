import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";

/**
 * Attaching or correcting a parcel's tracking after the fact.
 *
 * 🔑 Separate from creating the shipment because the two happen at different
 * moments. Somebody packing a box rarely has the number yet — it appears when
 * the label is bought or when a dropship supplier replies — so a tracking number
 * that can only be entered at creation is one that usually cannot be entered at
 * all.
 *
 * 🔴 `POST /v1/shipments/:id/tracking` has existed the whole time with nothing
 * calling it, which meant a wrong number could never be corrected either.
 *
 * ⚠️ The API takes a PATCH of four optional fields and refuses an empty one, so
 * this sends only what was filled in. An empty string clears a field
 * deliberately; leaving it untouched leaves the stored value alone.
 */
export function TrackingForm({
	workspaceId,
	shipmentId,
	carrier,
	serviceLevel,
	trackingNumber,
	trackingUrl,
}: {
	workspaceId: string;
	shipmentId: string;
	carrier: string | null;
	serviceLevel: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [draft, setDraft] = useState({
		carrier: carrier ?? "",
		serviceLevel: serviceLevel ?? "",
		trackingNumber: trackingNumber ?? "",
		trackingUrl: trackingUrl ?? "",
	});

	const changed = (key: keyof typeof draft, original: string | null) =>
		draft[key].trim() !== (original ?? "");

	const patch: Record<string, string | null> = {};
	if (changed("carrier", carrier)) patch.carrier = draft.carrier.trim() || null;
	if (changed("serviceLevel", serviceLevel))
		patch.serviceLevel = draft.serviceLevel.trim() || null;
	if (changed("trackingNumber", trackingNumber))
		patch.trackingNumber = draft.trackingNumber.trim() || null;
	if (changed("trackingUrl", trackingUrl))
		patch.trackingUrl = draft.trackingUrl.trim() || null;

	const save = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request(
				`/shipments/${shipmentId}/tracking`,
				{ method: "POST", body: patch, idempotencyKey: crypto.randomUUID() },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That tracking could not be saved."),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "shipments"],
			});
			setOpen(false);
		},
	});

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="h-7 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
			>
				{trackingNumber ? "Edit tracking" : "Add tracking"}
			</button>
		);
	}

	const field =
		"h-8 w-full rounded-lg border border-[var(--console-line-strong)] bg-transparent px-2.5 text-[12px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)]";

	return (
		<div className="grid gap-2 rounded-lg border border-[var(--console-line-soft)] p-3">
			{(
				[
					["carrier", "Carrier", "Canada Post"],
					["serviceLevel", "Service", "Expedited Parcel"],
					["trackingNumber", "Tracking number", ""],
					["trackingUrl", "Tracking link", "https://…"],
				] as const
			).map(([key, label, placeholder]) => (
				<label key={key} className="grid gap-1">
					<span className="text-[10.5px] text-[var(--ink-45)]">{label}</span>
					<input
						value={draft[key]}
						placeholder={placeholder}
						onChange={(event) =>
							setDraft((current) => ({ ...current, [key]: event.target.value }))
						}
						className={field}
					/>
				</label>
			))}

			{failure ? (
				<p className="text-[10.5px] text-[#ff6b6b]">{failure}</p>
			) : null}

			<div className="flex items-center gap-1.5">
				<button
					type="button"
					// Nothing changed means nothing to send: the API refuses an empty
					// patch, and offering a save that can only fail is worse than none.
					disabled={Object.keys(patch).length === 0 || save.isPending}
					onClick={() => save.mutate()}
					className="h-7 rounded-full bg-[rgb(var(--console-ink))] px-3 text-[11px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40"
				>
					{save.isPending ? "Saving…" : "Save tracking"}
				</button>
				<button
					type="button"
					onClick={() => setOpen(false)}
					className="h-7 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
