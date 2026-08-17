import type { ReactNode } from "react";
import { DetailPanel } from "./detail-panel";

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
	failure?: string | null;
	children: ReactNode;
}) {
	return (
		<DetailPanel
			title={title}
			onClose={onClose}
			footer={
				<>
					{failure ? (
						<p className="mb-2 text-[11.5px] text-[var(--signal-failure)]">
							{failure}
						</p>
					) : null}
					<button
						type="submit"
						form="create-panel-form"
						disabled={busy || !valid}
						className={`${busy ? "shimmer-busy" : ""} inline-flex h-9 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
					>
						{busy ? "Saving…" : submitLabel}
					</button>
				</>
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
