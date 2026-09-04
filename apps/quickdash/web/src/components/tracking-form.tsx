import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { WriteFailure } from "./page-state";
import { SaveLabel, useSavedFlash } from "./save-button";

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
			setFailure({
				error: error,
				fallback: "That tracking could not be saved.",
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "shipments"],
			});
			setOpen(false);
		},
	});

	// 🔴 ABOVE the early return. `useSavedFlash` is a hook, so it has to run on
	// every render of this component or the hook order changes between the two
	// branches, which React reads as a different component. It sat below the
	// return that renders the collapsed state, so the order flipped the moment
	// this opened.
	const saved = useSavedFlash(save.isSuccess);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="control-raised h-7 rounded-md border px-3 text-[11px] text-[var(--ink-60)] outline-none hover:text-[var(--ink-90)]"
			>
				{trackingNumber ? "Edit tracking" : "Add tracking"}
			</button>
		);
	}

	const field =
		"h-8 w-full field rounded-md px-2.5 text-[12px] text-[var(--ink-85)] outline-none";

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
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<div className="flex items-center gap-1.5">
				<button
					type="button"
					// Nothing changed means nothing to send: the API refuses an empty
					// patch, and offering a save that can only fail is worse than none.
					data-hint={
						Object.keys(patch).length === 0
							? "Change something first"
							: undefined
					}
					disabled={Object.keys(patch).length === 0 || save.isPending}
					onClick={() => save.mutate()}
					className={`${save.isPending ? "shimmer-busy" : ""} h-7 rounded-full bg-[rgb(var(--console-ink))] px-3 text-[11px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
				>
					<SaveLabel saving={save.isPending} saved={saved}>
						Save tracking
					</SaveLabel>
				</button>
				<button
					type="button"
					onClick={() => setOpen(false)}
					className="control-raised h-7 rounded-md border px-3 text-[11px] text-[var(--ink-60)] outline-none hover:text-[var(--ink-90)]"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
