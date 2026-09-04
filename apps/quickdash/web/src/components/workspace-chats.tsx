import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useAssistant } from "../lib/assistant";

/**
 * Saved chats, in the console's own sidebar.
 *
 * 🔴 HERE rather than inside the assistant panel, and that is the whole point.
 * The panel is one conversation; this is every conversation. Putting the list
 * in the panel meant either a popover, which hides what you are trying to pick
 * from, or a rail inside a column that is already narrow, which takes space
 * from the thing you came to read. The sidebar is the console's list column and
 * it already swaps between navigation and notifications, so a third context
 * costs nothing and behaves the way the other two do.
 *
 * ⚠️ Reads the shared provider, never its own copy. Two lists disagreeing about
 * which chat is open is the exact bug this arrangement exists to avoid.
 */
export function WorkspaceChats() {
	const assistant = useAssistant();
	if (!assistant) return null;
	const { conversations, activeId, open, remove } = assistant;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-2 py-2">
				<button
					type="button"
					onClick={() => open(null)}
					/* 🔴 FLAT. The left sidebar carries no relief at all, deliberately
					   and repeatedly: it is the console's ground, and a raised key in
					   it makes the navigation beside it look unfinished rather than
					   making the button look important. Ink and a hover fill, the same
					   as every other row in this column. */
					className="flex h-8 w-full items-center gap-2 rounded-md border border-[var(--console-line-soft)] px-2 text-[12px] text-[var(--ink-55)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.05)] hover:text-[var(--ink-90)]"
				>
					<PlusIcon size={13} />
					New chat
				</button>
			</div>

			{conversations.length === 0 ? (
				<p className="px-3 py-1 text-[11.5px] text-[var(--ink-30)] leading-[1.5]">
					Nothing saved yet. Ask QuickAssist something and the conversation is
					kept here.
				</p>
			) : (
				/* `fade-ends`, the same treatment the navigation got, so a long list
				   dissolves at both ends instead of being cut by a hard edge. */
				<div className="fade-ends min-h-0 flex-1 overflow-y-auto px-2 pb-2">
					<div className="flex flex-col gap-0.5">
						{conversations.map((entry) => (
							<div key={entry.id} className="group/chat relative">
								<button
									type="button"
									onClick={() => open(entry.id)}
									className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 pr-7 text-left transition-colors hover:bg-[rgb(var(--console-ink)/0.05)] ${
										entry.id === activeId
											? "bg-[rgb(var(--console-ink)/0.06)] text-[var(--ink-90)]"
											: "text-[var(--ink-55)]"
									}`}
								>
									<span className="w-full truncate text-[12px]">
										{entry.title}
									</span>
									<span className="mt-px text-[10.5px] text-[var(--ink-25)]">
										{new Date(entry.updatedAt).toLocaleDateString()}
									</span>
								</button>
								{/* On approach only. A delete on every row, always visible,
								    turns a list you are scanning into a minefield. */}
								<button
									type="button"
									aria-label={`Delete ${entry.title}`}
									data-hint="Delete this chat"
									onClick={() => remove(entry.id)}
									className="absolute top-2 right-1.5 flex size-5 items-center justify-center rounded-md text-[var(--ink-25)] opacity-0 transition-opacity hover:text-[var(--ink-85)] focus-visible:opacity-100 group-hover/chat:opacity-100"
								>
									<TrashIcon size={12} />
								</button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
