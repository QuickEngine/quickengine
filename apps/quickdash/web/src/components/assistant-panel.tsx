import { PaperPlaneRightIcon, SparkleIcon } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * The assistant column.
 *
 * 🔴 SCAFFOLD, and it says so on screen. Nothing behind this is wired: there is
 * no endpoint, no model call and no history. It is here so the shell's third
 * column can be designed and lived with before the plumbing exists — but an
 * input that silently swallows what somebody types is worse than no input, so it
 * is disabled and labelled rather than made to look ready.
 *
 * ⚠️ When it IS wired, the composer is the part that needs care rather than the
 * transcript: this console is where somebody manages workspaces, billing and
 * people, and an assistant that can act on those needs to show what it is about
 * to do before it does it.
 */
export function AssistantPanel({ onClose }: { onClose: () => void }) {
	const [draft, setDraft] = useState("");

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Matches the switcher and the page header at `h-16`, so all three tops
			    line up across the window. */}
			<div className="flex h-16 shrink-0 items-center gap-2 px-4">
				<SparkleIcon size={15} className="shrink-0 text-[var(--ink-45)]" />
				<p className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-85)]">
					Assistant
				</p>
				<button
					type="button"
					onClick={onClose}
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-30)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-70)]"
					aria-label="Close assistant"
				>
					<span aria-hidden="true" className="text-[15px] leading-none">
						×
					</span>
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
				<p className="text-[12.5px] text-[var(--ink-45)]">Not connected yet</p>
				<p className="text-[11.5px] text-[var(--ink-30)] leading-[1.5]">
					This panel is the shape the assistant will take. Nothing is wired
					behind it, so it will not answer anything.
				</p>
			</div>

			<div className="shrink-0 p-3">
				<div className="flex items-end gap-2 rounded-lg border border-[var(--console-line)] bg-[var(--console-bg)] p-2">
					<textarea
						rows={2}
						disabled
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder="Ask about this workspace…"
						className="min-h-0 w-full flex-1 resize-none bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-25)] disabled:cursor-not-allowed"
					/>
					<button
						type="button"
						disabled
						aria-label="Send"
						className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--console-ink)/0.10)] text-[var(--ink-40)] disabled:cursor-not-allowed"
					>
						<PaperPlaneRightIcon size={13} />
					</button>
				</div>
			</div>
		</div>
	);
}
