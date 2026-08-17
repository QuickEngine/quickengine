import { QuestionIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { clientEnv } from "../lib/env";

/**
 * Help, reachable from anywhere without leaving the workspace.
 *
 * 🔑 A bubble rather than a menu item, because needing help is not a place you
 * navigate to — it happens while you are in the middle of something, and a link
 * that throws you into Account abandons whatever you were doing. Same panel on
 * every page, same content, no redirect.
 *
 * ⚠️ It deliberately does NOT try to answer questions. It points at the docs,
 * offers to send a message, and shows the one thing support will ask for — the
 * workspace this is about. A help widget pretending to be a search engine is
 * how people end up reading three wrong articles before giving up.
 */
export function SupportBubble({
	workspaceName,
	onFeedback,
}: {
	workspaceName?: string;
	/** Opens the same dialog the account menu uses, rather than a second form. */
	onFeedback: () => void;
}) {
	const [open, setOpen] = useState(false);

	const row =
		"flex h-9 w-full items-center rounded-md px-2.5 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)]";

	return (
		<div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
			{open ? (
				<div className="w-72 rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-2 shadow-2xl">
					<div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
						<p className="min-w-0 flex-1 text-[12.5px] text-[var(--ink-85)]">
							Help
						</p>
						{workspaceName ? (
							<span className="truncate rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-45)]">
								{workspaceName}
							</span>
						) : null}
					</div>

					<a
						href={`${clientEnv.WEB_URL}/docs`}
						target="_blank"
						rel="noreferrer"
						className={row}
					>
						Read the docs
					</a>
					<button
						type="button"
						className={row}
						onClick={() => {
							setOpen(false);
							onFeedback();
						}}
					>
						Send us a message
					</button>
					<a href={`${clientEnv.WEB_URL}/status`} className={row}>
						Check service status
					</a>

					{/* The thing support asks for first. Shown here so nobody has to be
					    talked through finding it mid-conversation. */}
					<p className="px-2.5 pt-2 pb-1 text-[10.5px] text-[var(--ink-30)] leading-4">
						If something is broken, the request ID shown on the error is the
						fastest way for us to find it.
					</p>
				</div>
			) : null}

			<button
				type="button"
				aria-label={open ? "Close help" : "Open help"}
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex size-10 items-center justify-center rounded-full border border-[var(--console-line-strong)] bg-[var(--console-pop)] text-[var(--ink-60)] shadow-lg outline-none transition-colors hover:text-[var(--ink-90)]"
			>
				{open ? <XIcon size={16} /> : <QuestionIcon size={17} />}
			</button>
		</div>
	);
}
