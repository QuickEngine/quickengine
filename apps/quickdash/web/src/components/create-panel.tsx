import type { ReactNode } from "react";
import { useOnline } from "../lib/online";
import { DetailPanel } from "./detail-panel";
import { WriteFailure } from "./page-state";
import { SaveLabel, useSavedFlash } from "./save-button";

/**
 * Making a new record, in the same panel that shows an existing one.
 *
 * 🔴 These used to be a strip of inputs wedged between the header and the list.
 * Two things were wrong with that: it pushed the list down every time it opened,
 * and it meant creating a thing looked nothing like editing the same thing —
 * one a cramped horizontal row, the other a full panel. Same record, same
 * shape.
 *
 * 🔑 Fields stack. A horizontal strip is what forced every create form to be
 * two fields long; a panel has room for as many as the record actually needs,
 * which is why `New client` can grow past name and email without a redesign.
 */
export function CreatePanel({
	title,
	onClose,
	onSubmit,
	submitLabel,
	busy = false,
	valid = true,
	blockedReason,
	savedAt,
	failure,
	children,
}: {
	/** What is being made. "New client", not "Create". */
	title: string;
	onClose: () => void;
	onSubmit: () => void;
	submitLabel: string;
	busy?: boolean;
	/** Whether the form can be submitted at all. */
	valid?: boolean;
	/**
	 * Why not, when `valid` is false.
	 *
	 * 🔑 The caller supplies it because only the caller knows what is missing.
	 * A generic "fill in the form" is the same dead end as saying nothing.
	 */
	blockedReason?: string;
	/** Set by the caller when the create succeeded, so the button can tick. */
	savedAt?: unknown;
	/** The failure itself, so it can reach the status and the request id. */
	failure?: { error: unknown; fallback: string } | null;
	children: ReactNode;
}) {
	const online = useOnline();
	// A tick when it worked, for a moment, before the panel closes.
	const saved = useSavedFlash(Boolean(savedAt));
	return (
		<DetailPanel
			title={title}
			onClose={onClose}
			// Under the header, not beside the submit button — see `DetailPanel`.
			notice={
				failure ? (
					<WriteFailure error={failure.error} message={failure.fallback} />
				) : null
			}
			footer={
				<button
					type="submit"
					form="create-panel-form"
					title={
						!online
							? "Waiting for a connection"
							: !valid
								? blockedReason
								: undefined
					}
					disabled={busy || !valid || !online}
					/* 🔴 Refuses BEFORE it can lose the work.
					   Offline, this used to submit, fail, and leave the reason under
					   a form still full of typing — so the data survived only while
					   the panel stayed open. The button says what it is waiting for
					   instead, which keeps everything on screen until it can go. */
					className={`${busy ? "shimmer-busy" : ""} inline-flex h-9 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
				>
					<SaveLabel
						saving={busy}
						saved={saved}
						savingLabel={!online ? "Waiting…" : "Saving…"}
					>
						{submitLabel}
					</SaveLabel>
				</button>
			}
		>
			{/*
			  ⚠️ The submit button lives in the pinned footer, OUTSIDE this form, so
			  it is joined back by `form=`. Without that a long create form would
			  scroll its own submit out of reach — and pressing Enter in a field
			  would still submit while the button somebody is looking for is gone.
			*/}
			<form
				id="create-panel-form"
				className="space-y-3"
				onSubmit={(event) => {
					event.preventDefault();
					if (valid && !busy) onSubmit();
				}}
			>
				{children}
			</form>
		</DetailPanel>
	);
}
